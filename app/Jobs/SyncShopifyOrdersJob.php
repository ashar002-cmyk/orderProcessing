<?php

namespace App\Jobs;

use App\Models\SyncLog;
use App\Models\User;
use App\Services\Orders\ShopifyOrderSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * SyncShopifyOrdersJob
 *
 * Queued job that runs ShopifyOrderSyncService for a given shop.
 * Dispatched from DashboardController when the merchant clicks "Sync Orders".
 *
 * Running inside a job ensures:
 *  - The HTTP request returns immediately (non-blocking)
 *  - The sync can take as long as needed
 *  - Failures are recorded and retryable
 */
class SyncShopifyOrdersJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int    $tries   = 3;
    public int $timeout = 900;
    public bool $failOnTimeout = true;
    public array $backoff = [30, 60, 120];

    public function __construct(public int $userId, public int $limit = 250)
    {
        $this->onQueue('default');
    }

    public function handle(ShopifyOrderSyncService $syncService): void
    {
        $user = User::find($this->userId);

        if (! $user) {
            Log::error('[SyncShopifyOrdersJob] User not found', ['user_id' => $this->userId]);
            return;
        }

        Log::info('[SyncShopifyOrdersJob] Starting sync', [
            'job_id' => $this->job?->getJobId(),
            'attempt' => $this->attempts(),
            'user_id' => $user->id,
            'shop' => $user->shopify_domain ?? $user->name,
            'page_size' => $this->limit,
            'queue' => $this->queue ?? 'default',
            'timeout_seconds' => $this->timeout,
        ]);

        $user->update(['order_sync_status' => 'running']);

        $syncLog = $syncService->sync($user, $this->limit);

        Log::info('[SyncShopifyOrdersJob] Job completed', [
            'job_id' => $this->job?->getJobId(),
            'sync_log_id' => $syncLog->id,
            'user_id' => $user->id,
            'status' => $syncLog->status,
            'synced_records' => $syncLog->synced_records,
            'failed_records' => $syncLog->failed_records,
        ]);
    }

    public function failed(Throwable $e): void
    {
        Log::error('[SyncShopifyOrdersJob] Job permanently failed', [
            'user_id' => $this->userId,
            'error'   => $e->getMessage(),
        ]);

        $user = User::find($this->userId);

        if ($user) {
            $user->update(['order_sync_status' => 'failed']);
        }

        // Mark any running sync log as failed
        SyncLog::where('user_id', $this->userId)
            ->where('status', 'running')
            ->update([
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at'  => now(),
            ]);
    }
}
