<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\SyncLogController;
use App\Http\Controllers\WebhookLogController;
use Illuminate\Support\Facades\Route;
use Osiset\ShopifyApp\Contracts\Queries\Shop;
use Osiset\ShopifyApp\Messaging\Jobs\WebhookInstaller;
use Osiset\ShopifyApp\Objects\Values\ShopDomain;
use Osiset\ShopifyApp\Util;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Shopify embedded app routes — rendered via Inertia + React.
|
| The Osiset package automatically adds OAuth routes (/authenticate, etc.)
| via its ServiceProvider. All app routes inside the verify.shopify group
| require a valid authenticated Shopify session.
|
| Webhook routing is handled entirely by the package's POST /webhook/{type}
| route (registered in the api middleware group). The package verifies HMAC
| via its auth.webhook middleware and dispatches the mapped job classes from
| config/shopify-app.php → webhook_jobs. Do NOT add custom webhook routes
| here — they would shadow the package route and break the flow.
|
*/

// ── Authenticated App Routes (Inertia) ───────────────────────────────────
// verify.shopify middleware from the Osiset package validates the Shopify session.

Route::middleware(['verify.shopify'])->group(function () {

    // Dashboard
    Route::get('/',         [DashboardController::class, 'index'])->name('home');
    Route::get('/dashboard',[DashboardController::class, 'index'])->name('dashboard');

    // Sync trigger (POST → dispatches SyncShopifyOrdersJob)
    Route::post('/orders/sync', [DashboardController::class, 'syncOrders'])->name('orders.sync');

    // Orders
    Route::get('/orders',              [OrderController::class, 'index'])->name('orders.index');
    Route::get('/orders/{order}',      [OrderController::class, 'show'])->name('orders.show');
    Route::post('/orders/{order}/refresh', [OrderController::class, 'refresh'])->name('orders.refresh');

    // Webhook Logs
    Route::get('/webhook-logs',                         [WebhookLogController::class, 'index'])->name('webhook-logs.index');
    Route::post('/webhook-logs/{webhookEvent}/retry',   [WebhookLogController::class, 'retry'])->name('webhook-logs.retry');

    // Sync Logs
    Route::get('/sync-logs', [SyncLogController::class, 'index'])->name('sync-logs.index');

    // Settings
    Route::get('/settings', [DashboardController::class, 'settings'])->name('settings');
});

Route::get('/test-webhook', function () {
    $user = User::find(3);
    //dd($user);
 $response = $user->api()->rest('GET', '/admin/api/2023-04/webhooks.json');
    return json_encode($response,JSON_PRETTY_PRINT);
});

Route::get('/jobs-result2', function (Shop $query) {
    $users = User::whereNotNull('password')->get();
    $processed = 0;
    $errors = [];
    
    foreach ($users as $user) {
        try {
            $shopName = ShopDomain::fromNative($user->name);
            $shop = $query->getByDomain($shopName);
            
            if ($shop) {
                $shopId = $shop->getId();
                WebhookInstaller::dispatch($shopId, Util::getShopifyConfig('webhooks'));
                $processed++;
            }
        } catch (\Exception $e) {
            $errors[] = "User {$user->id} ({$user->name}): " . $e->getMessage();
        }
    }
    
    return response()->json([
        'success' => true,
        'message' => "Webhook reinstall dispatched for {$processed} users",
        'errors' => $errors
    ]);
});