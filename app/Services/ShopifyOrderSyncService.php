<?php

namespace App\Services;

use App\Models\OrderTimelineEvent;
use App\Models\ShopifyOrder;
use App\Models\SyncLog;
use App\Models\User;
use App\Services\Shopify\ShopifyGraphqlService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * ShopifyOrderSyncService
 *
 * Performs a full cursor-based GraphQL sync of orders for a given shop.
 * Designed to run inside SyncShopifyOrdersJob so it does not block the frontend.
 *
 * Flow:
 *  1. Create a SyncLog with status = running
 *  2. Paginate through orders via GraphQL
 *  3. updateOrCreate each order locally
 *  4. Create a "created" timeline event if new
 *  5. Update SyncLog to completed (or failed)
 *  6. Update shop sync fields on the User record
 */
class ShopifyOrderSyncService
{
    protected ShopifyGraphqlService $graphql;

    public function __construct(ShopifyGraphqlService $graphql)
    {
        $this->graphql = $graphql;
    }

    /**
     * Run the full sync for the given user/shop.
     *
     * @param  User $user
     * @return SyncLog
     */
    public function syncForUser(User $user): SyncLog
    {
        // Create a sync log entry to track progress
        $syncLog = SyncLog::create([
            'user_id'    => $user->id,
            'sync_type'  => 'orders',
            'status'     => 'running',
            'started_at' => now(),
        ]);

        $limit  = (int) env('ORDER_SYNC_LIMIT', 5000);
        $cursor = null;

        $totalRecords  = 0;
        $syncedRecords = 0;
        $failedRecords = 0;

        try {
            do {
                // Fetch one page of orders from Shopify GraphQL API
                $result   = $this->graphql->fetchOrders($limit, $cursor);
                $edges    = $result['orders'];
                $pageInfo = $result['pageInfo'];

                $totalRecords += count($edges);

                foreach ($edges as $edge) {
                    try {
                        $node = $edge['node'];
                        $this->processOrderNode($user, $node, $syncLog);
                        $syncedRecords++;
                    } catch (Throwable $e) {
                        $failedRecords++;
                        Log::warning('[ShopifyOrderSyncService] Failed to save order', [
                            'order' => $edge['node']['id'] ?? null,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }

                // Update progress counters in real-time
                $syncLog->update([
                    'total_records'  => $totalRecords,
                    'synced_records' => $syncedRecords,
                    'failed_records' => $failedRecords,
                ]);

                // Move to next page
                $cursor   = $pageInfo['endCursor'] ?? null;
                $hasNext  = $pageInfo['hasNextPage'] ?? false;

            } while ($hasNext && $cursor);

            // Mark sync as completed
            $syncLog->update([
                'status'       => 'completed',
                'completed_at' => now(),
            ]);

            // Update user sync tracking fields
            $user->update([
                'order_sync'        => true,
                'order_synced_at'   => now(),
                'order_sync_status' => 'completed',
            ]);

            Log::info('[ShopifyOrderSyncService] Sync completed', [
                'shop'    => $user->shopify_domain,
                'synced'  => $syncedRecords,
                'failed'  => $failedRecords,
            ]);
        } catch (Throwable $e) {
            $syncLog->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at'  => now(),
            ]);

            $user->update(['order_sync_status' => 'failed']);

            Log::error('[ShopifyOrderSyncService] Sync failed', [
                'shop'  => $user->shopify_domain,
                'error' => $e->getMessage(),
            ]);
        }

        return $syncLog;
    }

    // ── Private helpers ───────────────────────────────────────────────

    /**
     * Upsert a single order node returned from GraphQL into the local DB.
     * Also seeds the "created" timeline event for brand-new orders.
     */
    private function processOrderNode(User $user, array $node, SyncLog $syncLog): void
    {
        // Extract the numeric Shopify ID from the GID string
        // e.g. "gid://shopify/Order/6123456789" → "6123456789"
        $shopifyId = (string) $this->extractNumericId($node['id']);

        $customerName  = trim(($node['customer']['displayName'] ?? ''));
        $customerEmail = $node['customer']['email'] ?? null;

        $money = $node['totalPriceSet']['shopMoney'] ?? [];

        /** @var ShopifyOrder $order */
        [$order, $created] = tap(
            ShopifyOrder::updateOrCreate(
                [
                    'user_id'          => $user->id,
                    'shopify_order_id' => $shopifyId,
                ],
                [
                    'order_name'         => $node['name'] ?? null,
                    'customer_name'      => $customerName ?: null,
                    'customer_email'     => $customerEmail,
                    'financial_status'   => $this->normalizeStatus($node['displayFinancialStatus'] ?? null),
                    'fulfillment_status' => $this->normalizeStatus($node['displayFulfillmentStatus'] ?? null),
                    'total_price'        => $money['amount'] ?? 0,
                    'currency'           => $money['currencyCode'] ?? 'USD',
                    'shopify_created_at' => $node['createdAt'] ?? null,
                    'shopify_updated_at' => $node['updatedAt'] ?? null,
                    'raw_data'           => $node,
                ]
            ),
            fn($o) => null
        );

        // Create a "created" timeline event only for orders that are new to us
        $alreadyHasCreatedEvent = OrderTimelineEvent::where('user_id', $user->id)
            ->where('shopify_order_id', $shopifyId)
            ->where('event_type', 'created')
            ->exists();

        if (!$alreadyHasCreatedEvent) {
            OrderTimelineEvent::updateOrCreate(
                [
                    'user_id'          => $user->id,
                    'shopify_order_id' => $shopifyId,
                    'event_type'       => 'created',
                    'source'           => 'sync',
                ],
                [
                    'shopify_order_id_local' => $order->id,
                    'event_label'            => 'Order Created',
                    'happened_at'            => $node['createdAt'] ?? now(),
                    'metadata'               => [
                        'financial_status'   => $this->normalizeStatus($node['displayFinancialStatus'] ?? null),
                        'fulfillment_status' => $this->normalizeStatus($node['displayFulfillmentStatus'] ?? null),
                        'sync_log_id'        => $syncLog->id,
                    ],
                ]
            );
        }
    }

    /**
     * Convert a Shopify GID (e.g. "gid://shopify/Order/12345") to a numeric string.
     */
    private function extractNumericId(string $gid): string
    {
        return (string) last(explode('/', $gid));
    }

    /**
     * Convert Shopify's SCREAMING_SNAKE_CASE statuses to snake_case.
     * e.g. PARTIALLY_PAID → partially_paid, null → null
     */
    private function normalizeStatus(?string $status): ?string
    {
        return $status ? strtolower($status) : null;
    }
}
