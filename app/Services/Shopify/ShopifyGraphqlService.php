<?php

namespace App\Services\Shopify;

use App\Models\User;
use Exception;
use Illuminate\Support\Facades\Log;

/**
 * ShopifyGraphqlService
 *
 * Wraps the Osiset package's GraphQL client to provide typed helper
 * methods for common Admin API calls.
 *
 * Usage (static/injectable):
 *   app(ShopifyGraphqlService::class)->query($user, $gql, $vars);
 *   app(ShopifyGraphqlService::class)->getOrders($user, $cursor, 50);
 */
class ShopifyGraphqlService
{
    // â”€â”€ Generic query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Execute any GraphQL query against a shop's Admin API.
     *
     * @param  User   $user       The authenticated shop user
     * @param  string $query      GraphQL query string
     * @param  array  $variables  Optional variables (merged into query via simple string replace)
     * @return array              The data portion of the GraphQL response
     * @throws Exception
     */
    public function query(User $user, string $query, array $variables = []): array
    {
        try {
            $response = $user->api()->graph($query);

            // Convert ResponseAccess (or any object) to a plain PHP array
            $body = json_decode(json_encode($response['body'] ?? []), true) ?? [];

            if (!empty($body['errors'])) {
                throw new Exception(
                    'Shopify GraphQL error: ' . json_encode($body['errors'])
                );
            }

            return $body['data'] ?? [];
        } catch (Exception $e) {
            Log::error('[ShopifyGraphqlService] Query failed', [
                'shop'  => $user->shopify_domain,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    // â”€â”€ Order fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Fetch a page of orders using cursor-based pagination.
     *
     * Returns:
     *   [
     *     'orders'      => [...],   // array of order nodes
     *     'hasNextPage' => bool,
     *     'endCursor'   => string|null
     *   ]
     *
     * @param  User        $user
     * @param  string|null $cursor  Pagination cursor from previous call
     * @param  int         $limit   Orders per page (max 250)
     * @return array
     * @throws Exception
     */
    public function getOrders(User $user, ?string $cursor = null, int $limit = 50): array
    {
        $limit = max(1, min($limit, 250));
        $afterClause = $cursor ? ", after: \"{$cursor}\"" : '';

        $gql = <<<GQL
        {
            orders(first: {$limit}{$afterClause}, sortKey: CREATED_AT, reverse: true) {
                edges {
                    node {
                        id
                        name
                        email
                        createdAt
                        updatedAt
                        cancelledAt
                        closedAt
                        displayFinancialStatus
                        displayFulfillmentStatus
                        totalPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        customer {
                            firstName
                            lastName
                            email
                        }
                        fulfillments {
                            createdAt
                            status
                        }
                        transactions {
                            createdAt
                            status
                            kind
                            amountSet {
                                shopMoney {
                                    amount
                                    currencyCode
                                }
                            }
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
        GQL;

        $data     = $this->query($user, $gql);
        $edges    = $data['orders']['edges'] ?? [];
        $pageInfo = $data['orders']['pageInfo'] ?? [];

        return [
            'orders'      => array_column($edges, 'node'),
            'hasNextPage' => $pageInfo['hasNextPage'] ?? false,
            'endCursor'   => $pageInfo['endCursor'] ?? null,
        ];
    }

    /** @return array<int, string> */
    public function getGrantedAccessScopes(User $user): array
    {
        $data = $this->query($user, <<<'GQL'
        {
            currentAppInstallation {
                accessScopes {
                    handle
                }
            }
        }
        GQL);

        return array_values(array_filter(array_column(
            $data['currentAppInstallation']['accessScopes'] ?? [],
            'handle'
        )));
    }

    /**
     * Fetch a single order by its Shopify GID or numeric ID.
     *
     * @param  User   $user
     * @param  string $shopifyOrderId  Numeric ID or full GID
     * @return array|null
     * @throws Exception
     */
    public function getOrderById(User $user, string $shopifyOrderId): ?array
    {
        // Normalise to full GID
        $gid = str_starts_with($shopifyOrderId, 'gid://')
            ? $shopifyOrderId
            : "gid://shopify/Order/{$shopifyOrderId}";

        $gql = <<<GQL
        {
            order(id: "{$gid}") {
                id
                name
                email
                createdAt
                updatedAt
                cancelledAt
                closedAt
                displayFinancialStatus
                displayFulfillmentStatus
                totalPriceSet {
                    shopMoney {
                        amount
                        currencyCode
                    }
                }
                customer {
                    firstName
                    lastName
                    email
                }
                fulfillments {
                    createdAt
                    status
                }
                transactions {
                    createdAt
                    status
                    kind
                    amountSet {
                        shopMoney {
                            amount
                            currencyCode
                        }
                    }
                }
            }
        }
        GQL;

        $data = $this->query($user, $gql);

        return $data['order'] ?? null;
    }

    /**
     * Fetch basic shop information.
     *
     * @param  User $user
     * @return array
     * @throws Exception
     */
    public function fetchShopInfo(User $user): array
    {
        $gql = <<<GQL
        {
            shop {
                name
                email
                myshopifyDomain
                plan {
                    displayName
                }
                currencyCode
            }
        }
        GQL;

        return $this->query($user, $gql);
    }

    // â”€â”€ Legacy method kept for backward compatibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * @deprecated  Inject User via query() or getOrders() instead.
     */
    public function fetchOrders(int $limit = 50, ?string $cursor = null): array
    {
        throw new \LogicException(
            'fetchOrders() is deprecated. Use getOrders(User $user, ...) instead.'
        );
    }
}
