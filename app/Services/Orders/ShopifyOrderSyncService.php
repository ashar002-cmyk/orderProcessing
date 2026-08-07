<?php

namespace App\Services\Orders;

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
 * Performs a full cursor-based GraphQL sync of Shopify orders for a shop.
 * Designed to run inside SyncShopifyOrdersJob so it does not block the frontend.
 *
 * Flow:
 *  1. Create a SyncLog with status = running
 *  2. Paginate through orders via GraphQL
 *  3. updateOrCreate each order locally
 *  4. Create timeline events from synced data
 *  5. Update SyncLog to completed (or failed)
 *  6. Update shop sync fields on the User record
 */
class ShopifyOrderSyncService
{
    public function __construct(
        protected ShopifyGraphqlService $graphql,
        protected OrderTimelineService  $timeline,
    ) {}

    /**
     * Run the full sync for a given shop.
     *
     * @param  User $user
     * @param  int  $limit  Orders per page (max 250)
     * @return SyncLog
     */
    public function sync(User $user, int $limit = 50): SyncLog
    {
        $startedAt = microtime(true);
        $limit = max(1, min($limit, 250));

        $syncLog = SyncLog::create([
            'user_id'    => $user->id,
            'sync_type'  => 'orders',
            'status'     => 'running',
            'started_at' => now(),
        ]);

        $cursor        = null;
        $totalRecords  = 0;
        $syncedRecords = 0;
        $failedRecords = 0;
        $page = 0;

        SyncLog::where('user_id', $user->id)
            ->where('status', 'running')
            ->whereKeyNot($syncLog->id)
            ->update([
                'status' => 'failed',
                'error_message' => 'Superseded by a newer order sync.',
                'completed_at' => now(),
            ]);

        Log::info('[OrderSync] Sync started', [
            'sync_log_id' => $syncLog->id,
            'user_id' => $user->id,
            'shop' => $user->shopify_domain ?? $user->name,
            'page_size' => $limit,
            'local_orders_before' => ShopifyOrder::where('user_id', $user->id)->count(),
        ]);

        try {
            $scopes = $this->graphql->getGrantedAccessScopes($user);
            $hasAllOrdersAccess = in_array('read_all_orders', $scopes, true);

            Log::info('[OrderSync] Shopify access scopes checked', [
                'sync_log_id' => $syncLog->id,
                'scopes' => $scopes,
                'has_read_all_orders' => $hasAllOrdersAccess,
            ]);

            if (! $hasAllOrdersAccess) {
                Log::warning('[OrderSync] Historical orders are not accessible', [
                    'sync_log_id' => $syncLog->id,
                    'shop' => $user->shopify_domain ?? $user->name,
                    'required_scope' => 'read_all_orders',
                    'effect' => 'Shopify only returns orders from the default recent-order window.',
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('[OrderSync] Could not inspect Shopify access scopes', [
                'sync_log_id' => $syncLog->id,
                'exception' => $e::class,
                'error' => $e->getMessage(),
            ]);
        }

        try {
            do {
                $page++;
                Log::info('[OrderSync] Requesting Shopify order page', [
                    'sync_log_id' => $syncLog->id,
                    'page' => $page,
                    'page_size' => $limit,
                    'has_cursor' => $cursor !== null,
                ]);

                $result   = $this->graphql->getOrders($user, $cursor, $limit);
                $orders   = $result['orders'];
                $hasNext  = $result['hasNextPage'];
                $cursor   = $result['endCursor'];

                Log::info('[OrderSync] Shopify order page received', [
                    'sync_log_id' => $syncLog->id,
                    'page' => $page,
                    'orders_received' => count($orders),
                    'has_next_page' => $hasNext,
                    'has_end_cursor' => $cursor !== null,
                    'first_order' => $orders[0]['name'] ?? null,
                    'last_order' => $orders[array_key_last($orders)]['name'] ?? null,
                ]);

                $totalRecords += count($orders);

                foreach ($orders as $orderNode) {
                    try {
                        $this->saveOrderFromGraphql($user, $orderNode);
                        $syncedRecords++;
                    } catch (Throwable $e) {
                        $failedRecords++;
                        Log::warning('[ShopifyOrderSyncService] Failed to save order', [
                            'sync_log_id' => $syncLog->id,
                            'page' => $page,
                            'order' => $orderNode['id'] ?? null,
                            'order_name' => $orderNode['name'] ?? null,
                            'exception' => $e::class,
                            'error' => $e->getMessage(),
                            'file' => $e->getFile(),
                            'line' => $e->getLine(),
                        ]);
                    }
                }

                // Update progress in real-time
                $syncLog->update([
                    'total_records'  => $totalRecords,
                    'synced_records' => $syncedRecords,
                    'failed_records' => $failedRecords,
                ]);

                Log::info('[OrderSync] Page persisted', [
                    'sync_log_id' => $syncLog->id,
                    'page' => $page,
                    'total_received' => $totalRecords,
                    'total_synced' => $syncedRecords,
                    'total_failed' => $failedRecords,
                ]);

            } while ($hasNext && $cursor);

            // Mark sync completed
            $syncLog->update([
                'status'       => 'completed',
                'completed_at' => now(),
            ]);

            // Update shop sync tracking
            $user->update([
                'order_sync'        => true,
                'order_synced_at'   => now(),
                'order_sync_status' => 'completed',
            ]);

            Log::info('[OrderSync] Sync completed', [
                'sync_log_id' => $syncLog->id,
                'user_id' => $user->id,
                'shop' => $user->shopify_domain ?? $user->name,
                'pages' => $page,
                'received' => $totalRecords,
                'synced' => $syncedRecords,
                'failed' => $failedRecords,
                'local_orders_after' => ShopifyOrder::where('user_id', $user->id)->count(),
                'duration_seconds' => round(microtime(true) - $startedAt, 2),
            ]);

        } catch (Throwable $e) {
            Log::error('[ShopifyOrderSyncService] Sync failed', [
                'sync_log_id' => $syncLog->id,
                'user_id' => $user->id,
                'shop' => $user->shopify_domain ?? $user->name,
                'page' => $page,
                'received' => $totalRecords,
                'synced' => $syncedRecords,
                'failed' => $failedRecords,
                'exception' => $e::class,
                'error'   => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'duration_seconds' => round(microtime(true) - $startedAt, 2),
            ]);

            $syncLog->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at'  => now(),
            ]);

            $user->update(['order_sync_status' => 'failed']);

            throw $e;
        }

        return $syncLog;
    }

    /**
     * Map a Shopify GraphQL order node to a local ShopifyOrder record.
     * Uses updateOrCreate for idempotency.
     */
    public function saveOrderFromGraphql(User $user, array $orderNode): ShopifyOrder
    {
        $customerName = trim(
            ($orderNode['customer']['firstName'] ?? '') . ' ' .
            ($orderNode['customer']['lastName'] ?? '')
        ) ?: null;

        $customerEmail = $orderNode['customer']['email'] ?? $orderNode['email'] ?? null;

        $totalPrice = $orderNode['totalPriceSet']['shopMoney']['amount'] ?? 0;
        $currency   = $orderNode['totalPriceSet']['shopMoney']['currencyCode'] ?? 'USD';

        $financial   = $orderNode['displayFinancialStatus'] ?? null;
        $fulfillment = $orderNode['displayFulfillmentStatus'] ?? null;
        $cancelledAt = $orderNode['cancelledAt'] ?? null;

        $stage = $this->timeline->getCurrentStage(
            $financial   ?? '',
            $fulfillment ?? '',
            cancelled: (bool) $cancelledAt
        );

        $normalizedOrderId = $this->normalizeGraphqlOrderId($orderNode['id'] ?? null);

        $order = ShopifyOrder::updateOrCreate(
            [
                'user_id'          => $user->id,
                'shopify_order_id' => $normalizedOrderId,
            ],
            [
                'order_name'         => $orderNode['name'] ?? null,
                'customer_name'      => $customerName,
                'customer_email'     => $customerEmail,
                'financial_status'   => $financial,
                'fulfillment_status' => $fulfillment,
                'total_price'        => $totalPrice,
                'currency'           => $currency,
                'current_stage'      => $stage,
                'shopify_created_at' => $orderNode['createdAt'] ?? null,
                'shopify_updated_at' => $orderNode['updatedAt'] ?? null,
                'raw_data'           => $orderNode,
            ]
        );

        // Build timeline events from the synced data
        $this->timeline->createEventsFromSyncedOrder($user, $order, $orderNode);

        return $order;
    }

    /**
     * Fetch and save a single order by Shopify ID.
     * Used when a webhook arrives before the full sync has run.
     */
    public function syncSingleOrderById(User $user, string $shopifyOrderId): ?ShopifyOrder
    {
        try {
            $orderNode = $this->graphql->getOrderById($user, $shopifyOrderId);

            if (!$orderNode) {
                Log::warning('[ShopifyOrderSyncService] Order not found on Shopify', [
                    'shopify_order_id' => $shopifyOrderId,
                ]);
                return null;
            }

            return $this->saveOrderFromGraphql($user, $orderNode);

        } catch (Throwable $e) {
            Log::error('[ShopifyOrderSyncService] Single order sync failed', [
                'shopify_order_id' => $shopifyOrderId,
                'error'            => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Strip the GraphQL GID prefix and return a plain numeric Shopify order ID.
     * e.g. "gid://shopify/Order/7509625471258" → "7509625471258"
     */
    private function normalizeGraphqlOrderId(?string $gid): ?string
    {
        if (! $gid) {
            return null;
        }

        return str_replace('gid://shopify/Order/', '', $gid);
    }
}
