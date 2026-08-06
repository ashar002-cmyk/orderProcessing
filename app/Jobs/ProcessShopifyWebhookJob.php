<?php

namespace App\Jobs;

use App\Models\WebhookEvent;
use App\Services\Webhooks\WebhookEventService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * ProcessShopifyWebhookJob
 *
 * Base job that dispatches specific webhook processing.
 * Used for app/uninstalled and any non-order webhook topics.
 * Order-specific topics are handled by ProcessOrderWebhookJob.
 */
class ProcessShopifyWebhookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int    $tries = 3;

    /** Wait 60 seconds before retrying a failed attempt */
    public int $backoff = 60;

    public function __construct(protected int $webhookEventId)
    {
        $this->onQueue('default');
    }

    public function handle(WebhookEventService $service): void
    {
        $event = WebhookEvent::find($this->webhookEventId);

        if (!$event) {
            Log::warning('[ProcessShopifyWebhookJob] WebhookEvent not found', [
                'id' => $this->webhookEventId,
            ]);
            return;
        }

        // Handle app/uninstalled separately — no order processing needed
        if ($event->topic === 'app/uninstalled') {
            $this->handleAppUninstalled($event);
            return;
        }

        // Delegate to the service for all other topics
        $service->process($event);
    }

    /**
     * When a shop uninstalls the app, we mark its token as revoked.
     * The package's own AppUninstalledJob handles DB cleanup.
     */
    private function handleAppUninstalled(WebhookEvent $event): void
    {
        Log::info('[ProcessShopifyWebhookJob] App uninstalled', [
            'shop' => $event->shop_domain,
        ]);

        $event->update([
            'status'       => 'success',
            'processed_at' => now(),
        ]);
    }

    /** Called when all retries are exhausted */
    public function failed(\Throwable $e): void
    {
        Log::error('[ProcessShopifyWebhookJob] Job permanently failed', [
            'webhook_event_id' => $this->webhookEventId,
            'error'            => $e->getMessage(),
        ]);

        WebhookEvent::where('id', $this->webhookEventId)
            ->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
            ]);
    }
}
