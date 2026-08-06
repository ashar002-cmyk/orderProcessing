<?php

namespace App\Http\Controllers\Api;

use App\Jobs\RetryFailedWebhookJob;
use App\Models\WebhookEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * WebhookLogController
 *
 * Lists webhook event logs and allows manual retry of failed events.
 */
class WebhookLogController extends BaseApiController
{
    // ── GET /api/webhook-events ───────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        $query = WebhookEvent::where('user_id', $user->id);

        // Filter by status
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        // Filter by topic
        if ($topic = $request->input('topic')) {
            $query->where('topic', $topic);
        }

        $events = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 20));

        return $this->success($events);
    }

    // ── POST /api/webhook-events/{id}/retry ───────────────────────────

    public function retry(Request $request, int $id): JsonResponse
    {
        $user = $this->getShop($request);
        if (!$user) return $this->error('Unauthenticated', 401);

        $event = WebhookEvent::where('user_id', $user->id)->find($id);

        if (!$event) {
            return $this->error('Webhook event not found', 404);
        }

        if ($event->status !== 'failed') {
            return $this->error('Only failed webhook events can be retried.', 422);
        }

        dispatch(new RetryFailedWebhookJob($event->id))->onQueue('default');

        return $this->success(null, 'Retry dispatched. Check the event status shortly.');
    }
}
