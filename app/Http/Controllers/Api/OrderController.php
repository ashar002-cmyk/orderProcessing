<?php

namespace App\Http\Controllers\Api;

use App\Jobs\SyncShopifyOrdersJob;
use App\Models\ShopifyOrder;
use App\Models\SyncLog;
use App\Services\OrderTimelineService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * OrderController
 *
 * Handles listing, searching, filtering, and timeline retrieval for orders.
 * Also handles triggering a manual sync.
 */
class OrderController extends BaseApiController
{
    public function __construct(protected OrderTimelineService $timelineService) {}

    // ── GET /api/orders ───────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        $query = ShopifyOrder::where('user_id', $user->id);

        // Search by order name or customer email
        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_name', 'like', "%{$search}%")
                  ->orWhere('customer_email', 'like', "%{$search}%")
                  ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }

        // Filter by financial_status
        if ($financialStatus = $request->input('financial_status')) {
            $query->where('financial_status', $financialStatus);
        }

        // Filter by fulfillment_status
        if ($fulfillmentStatus = $request->input('fulfillment_status')) {
            $query->where('fulfillment_status', $fulfillmentStatus);
        }

        // Filter by current_stage
        if ($stage = $request->input('stage')) {
            $query->where('current_stage', $stage);
        }

        // Date range filter
        if ($from = $request->input('date_from')) {
            $query->where('shopify_created_at', '>=', $from);
        }
        if ($to = $request->input('date_to')) {
            $query->where('shopify_created_at', '<=', $to);
        }

        $orders = $query->orderByDesc('shopify_created_at')
            ->paginate($request->input('per_page', 20));

        return $this->success($orders);
    }

    // ── GET /api/orders/{id} ──────────────────────────────────────────

    public function show(Request $request, int $id): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        $order = ShopifyOrder::where('user_id', $user->id)->find($id);

        if (!$order) {
            return $this->error('Order not found', 404);
        }

        return $this->success([
            'order'    => $order,
            'summary'  => $this->timelineService->getOrderSummary($order),
        ]);
    }

    // ── GET /api/orders/{id}/timeline ─────────────────────────────────

    public function timeline(Request $request, int $id): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        $order = ShopifyOrder::where('user_id', $user->id)->find($id);

        if (!$order) {
            return $this->error('Order not found', 404);
        }

        return $this->success([
            'summary'  => $this->timelineService->getOrderSummary($order),
            'timeline' => $this->timelineService->getTimeline($order),
        ]);
    }

    // ── POST /api/orders/sync ─────────────────────────────────────────

    public function sync(Request $request): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        // Prevent simultaneous sync runs for the same shop
        $runningSyncExists = SyncLog::where('user_id', $user->id)
            ->where('status', 'running')
            ->exists();

        if ($runningSyncExists) {
            return $this->error('A sync is already in progress for this shop.', 409);
        }

        // Mark status as running immediately so UI updates right away
        $user->update(['order_sync_status' => 'running']);

        // Dispatch the sync job to queue (non-blocking)
        SyncShopifyOrdersJob::dispatch($user->id)->onQueue('default');

        return $this->success(null, 'Order sync started. Check sync status for progress.');
    }
}
