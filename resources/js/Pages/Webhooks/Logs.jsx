/**
 * Webhooks/Logs.jsx — Inertia page
 *
 * Premium webhook monitoring screen.
 * Displays paginated webhook event logs with retry capability.
 * Receives `webhooks` (paginator) from WebhookLogController.
 */

import React from 'react';
import { router } from '@inertiajs/react';
import {
    Page,
    Card,
    Text,
    Badge,
    Button,
    BlockStack,
    InlineStack,
    Pagination,
} from '@shopify/polaris';
import AppLayout from '../../Components/Layout/AppLayout';
import { shopifyUrl } from '../../utils/shopifyRoute';
import { T } from '../../design/tokens';

// ── Theme helpers ────────────────────────────────────────────────────────

const C = {
    pageBg: '#F6F8FC',
    surface: '#FFFFFF',
    border: '#E3E8F2',
    borderSoft: '#EEF2F7',
    text: '#172033',
    textSub: '#475569',
    textMuted: '#64748B',
    primary: '#3B5BDB',
    primaryDark: '#2444B8',
    primarySoft: '#EEF2FF',
    blueSoft: '#EFF6FF',
    green: '#16A34A',
    greenSoft: '#ECFDF3',
    amber: '#D97706',
    amberSoft: '#FFF7ED',
    red: '#DC2626',
    redSoft: '#FEF2F2',
    purple: '#7C3AED',
    purpleSoft: '#F5F3FF',
    slateSoft: '#F8FAFC',
    shadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
    shadowSm: '0 4px 14px rgba(15, 23, 42, 0.05)',
    radius: '18px',
    radiusMd: '14px',
};

const statusConfig = {
    pending: {
        label: 'Pending',
        tone: 'attention',
        color: C.amber,
        bg: C.amberSoft,
    },
    processing: {
        label: 'Processing',
        tone: 'attention',
        color: C.primary,
        bg: C.primarySoft,
    },
    success: {
        label: 'Success',
        tone: 'success',
        color: C.green,
        bg: C.greenSoft,
    },
    failed: {
        label: 'Failed',
        tone: 'critical',
        color: C.red,
        bg: C.redSoft,
    },
    retrying: {
        label: 'Retrying',
        tone: 'warning',
        color: C.amber,
        bg: C.amberSoft,
    },
    ignored: {
        label: 'Ignored',
        tone: 'subdued',
        color: C.textMuted,
        bg: C.slateSoft,
    },
};

function cleanStatus(status) {
    return String(status ?? 'pending').toLowerCase();
}

function StatusPill({ status }) {
    const key = cleanStatus(status);
    const cfg = statusConfig[key] ?? {
        label: status || 'Unknown',
        tone: 'enabled',
        color: C.textMuted,
        bg: C.slateSoft,
    };

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                borderRadius: '999px',
                padding: '5px 10px',
                fontSize: '12px',
                lineHeight: 1,
                fontWeight: 700,
                color: cfg.color,
                background: cfg.bg,
                border: `1px solid ${cfg.bg}`,
                whiteSpace: 'nowrap',
                textTransform: 'capitalize',
            }}
        >
            <span
                style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: cfg.color,
                    boxShadow: `0 0 0 3px ${cfg.bg}`,
                    flexShrink: 0,
                }}
            />
            {cfg.label}
        </span>
    );
}

function TopicPill({ topic }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '999px',
                padding: '5px 10px',
                background: C.blueSoft,
                color: C.primaryDark,
                fontSize: '12px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
            }}
        >
            {topic || '—'}
        </span>
    );
}

function MetricCard({ label, value, tone = 'neutral' }) {
    const toneMap = {
        success: { bg: C.greenSoft, color: C.green },
        failed: { bg: C.redSoft, color: C.red },
        warning: { bg: C.amberSoft, color: C.amber },
        neutral: { bg: C.primarySoft, color: C.primary },
    };

    const cfg = toneMap[tone] ?? toneMap.neutral;

    return (
        <div
            style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: C.radiusMd,
                padding: '14px 16px',
                boxShadow: C.shadowSm,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                minHeight: '74px',
            }}
        >
            <div>
                <div style={{ fontSize: '12px', color: C.textMuted, fontWeight: 700 }}>
                    {label}
                </div>
                <div style={{ fontSize: '24px', color: C.text, fontWeight: 800, marginTop: '4px' }}>
                    {value ?? 0}
                </div>
            </div>
            <div
                style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    background: cfg.bg,
                    color: cfg.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '16px',
                }}
            >
                {tone === 'success' ? '✓' : tone === 'failed' ? '!' : tone === 'warning' ? '↻' : '●'}
            </div>
        </div>
    );
}

const TH = ({ children, align = 'left' }) => (
    <th
        style={{
            padding: '14px 16px',
            textAlign: align,
            fontSize: '11px',
            fontWeight: 800,
            color: C.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            background: C.slateSoft,
            borderBottom: `1px solid ${C.border}`,
            whiteSpace: 'nowrap',
        }}
    >
        {children}
    </th>
);

const TD = ({ children, align = 'left', muted = false }) => (
    <td
        style={{
            padding: '15px 16px',
            textAlign: align,
            verticalAlign: 'middle',
            fontSize: '13px',
            color: muted ? C.textMuted : C.textSub,
            borderBottom: `1px solid ${C.borderSoft}`,
        }}
    >
        {children}
    </td>
);

function EmptyWebhooksState() {
    return (
        <div
            style={{
                padding: '54px 24px',
                textAlign: 'center',
                background: C.surface,
            }}
        >
            <div
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '18px',
                    background: C.primarySoft,
                    color: C.primary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 800,
                    marginBottom: '14px',
                }}
            >
                🔔
            </div>
            <Text as="h3" variant="headingMd">
                No webhook events yet
            </Text>
            <div style={{ marginTop: '6px', color: C.textMuted, fontSize: '13px' }}>
                Shopify webhook deliveries will appear here after order events are received.
            </div>
        </div>
    );
}

function truncateError(message) {
    if (!message) return '—';
    return message.length > 90 ? `${message.substring(0, 90)}…` : message;
}

// ── Page component ────────────────────────────────────────────────────────

export default function WebhookLogs({ webhooks }) {
    const [retrying, setRetrying] = React.useState(null);
    const [hovered, setHovered] = React.useState(null);

    const items = webhooks?.data ?? [];

    const totals = React.useMemo(() => {
        return {
            total: webhooks?.total ?? items.length,
            success: items.filter((item) => cleanStatus(item.status) === 'success').length,
            failed: items.filter((item) => cleanStatus(item.status) === 'failed').length,
            pending: items.filter((item) => ['pending', 'processing', 'retrying'].includes(cleanStatus(item.status))).length,
        };
    }, [items, webhooks?.total]);

    function handleRetry(id) {
        setRetrying(id);
        router.post(shopifyUrl(`/webhook-logs/${id}/retry`), {}, {
            preserveScroll: true,
            onFinish: () => setRetrying(null),
        });
    }

    function goTo(url) {
        if (!url) return;
        router.get(shopifyUrl(url), {}, { preserveScroll: true, preserveState: true });
    }

    return (
        <AppLayout>
            <Page
                title="Webhook Logs"
                subtitle="Monitor Shopify webhook deliveries, processing status, and retry failed events."
                backAction={{ content: 'Dashboard', url: shopifyUrl('/dashboard') }}
            >
                <BlockStack gap="500">
                    {/* Hero / Monitor header */}
                    <div
                        style={{
                            background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primary} 52%, #6D7CF6 100%)`,
                            color: '#fff',
                            borderRadius: '22px',
                            padding: '22px',
                            boxShadow: '0 18px 45px rgba(59, 91, 219, 0.24)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                right: '-70px',
                                top: '-80px',
                                width: '210px',
                                height: '210px',
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.14)',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                right: '70px',
                                bottom: '-90px',
                                width: '170px',
                                height: '170px',
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.10)',
                            }}
                        />

                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.82 }}>
                                    Webhook monitoring
                                </div>
                                <div style={{ fontSize: '25px', fontWeight: 850, marginTop: '6px' }}>
                                    Shopify event delivery center 11111
                                </div>
                                <div style={{ fontSize: '13px', opacity: 0.82, marginTop: '7px', maxWidth: '620px' }}>
                                    Track order webhooks, processing attempts, failed deliveries, and retry activity from one clean operational view.
                                </div>
                            </div>

                            <Button onClick={() => router.reload({ preserveScroll: true })}>
                                Refresh Logs
                            </Button>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                            gap: '14px',
                        }}
                    >
                        <MetricCard label="Total Events" value={totals.total} />
                        <MetricCard label="Successful" value={totals.success} tone="success" />
                        <MetricCard label="Pending / Retrying" value={totals.pending} tone="warning" />
                        <MetricCard label="Failed" value={totals.failed} tone="failed" />
                    </div>

                    {/* Table */}
                    <Card padding="0">
                        <div
                            style={{
                                padding: '18px 20px',
                                borderBottom: `1px solid ${C.borderSoft}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div>
                                <Text as="h2" variant="headingMd">
                                    Event logs
                                </Text>
                                <div style={{ marginTop: '4px', color: C.textMuted, fontSize: '13px' }}>
                                    Review each incoming Shopify webhook and retry failed processing when needed.
                                </div>
                            </div>

                            <InlineStack gap="200" align="end">
                                <Badge tone="info">{webhooks?.total ?? 0} total</Badge>
                                {totals.failed > 0 && <Badge tone="critical">{totals.failed} failed</Badge>}
                            </InlineStack>
                        </div>

                        {items.length === 0 ? (
                            <EmptyWebhooksState />
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table
                                        style={{
                                            width: '100%',
                                            borderCollapse: 'separate',
                                            borderSpacing: 0,
                                            minWidth: '980px',
                                        }}
                                    >
                                        <thead>
                                            <tr>
                                                <TH>Topic</TH>
                                                <TH>Shop Domain</TH>
                                                <TH>Order ID</TH>
                                                <TH>Status</TH>
                                                <TH align="center">Attempts</TH>
                                                <TH>Error</TH>
                                                <TH>Processed At</TH>
                                                <TH align="right">Action</TH>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((wh) => {
                                                const isFailed = cleanStatus(wh.status) === 'failed';

                                                return (
                                                    <tr
                                                        key={wh.id}
                                                        onMouseEnter={() => setHovered(wh.id)}
                                                        onMouseLeave={() => setHovered(null)}
                                                        style={{
                                                            background:
                                                                hovered === wh.id
                                                                    ? C.slateSoft
                                                                    : isFailed
                                                                        ? 'linear-gradient(90deg, #FEF2F2 0%, #FFFFFF 22%)'
                                                                        : C.surface,
                                                            transition: 'background 0.15s ease',
                                                        }}
                                                    >
                                                        <TD>
                                                            <TopicPill topic={wh.topic} />
                                                        </TD>
                                                        <TD>
                                                            <span style={{ fontWeight: 650, color: C.text }}>
                                                                {wh.shop_domain ?? '—'}
                                                            </span>
                                                        </TD>
                                                        <TD muted>
                                                            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px' }}>
                                                                {wh.shopify_order_id ?? '—'}
                                                            </span>
                                                        </TD>
                                                        <TD>
                                                            <StatusPill status={wh.status} />
                                                        </TD>
                                                        <TD align="center">
                                                            <span
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    minWidth: '30px',
                                                                    justifyContent: 'center',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '999px',
                                                                    background: C.slateSoft,
                                                                    color: C.textSub,
                                                                    fontWeight: 750,
                                                                    fontSize: '12px',
                                                                }}
                                                            >
                                                                {wh.attempts ?? 0}
                                                            </span>
                                                        </TD>
                                                        <TD>
                                                            <span
                                                                title={wh.error_message || ''}
                                                                style={{
                                                                    color: wh.error_message ? C.red : C.textMuted,
                                                                    fontSize: '12px',
                                                                    lineHeight: 1.45,
                                                                }}
                                                            >
                                                                {truncateError(wh.error_message)}
                                                            </span>
                                                        </TD>
                                                        <TD muted>
                                                            {wh.processed_at
                                                                ? new Date(wh.processed_at).toLocaleString()
                                                                : '—'}
                                                        </TD>
                                                        <TD align="right">
                                                            {isFailed ? (
                                                                <Button
                                                                    size="slim"
                                                                    tone="critical"
                                                                    loading={retrying === wh.id}
                                                                    onClick={() => handleRetry(wh.id)}
                                                                >
                                                                    Retry
                                                                </Button>
                                                            ) : (
                                                                <span style={{ color: C.textMuted, fontSize: '12px' }}>
                                                                    —
                                                                </span>
                                                            )}
                                                        </TD>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div
                                    style={{
                                        padding: '14px 18px',
                                        borderTop: `1px solid ${C.borderSoft}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px',
                                        flexWrap: 'wrap',
                                        background: C.slateSoft,
                                    }}
                                >
                                    <span style={{ fontSize: '13px', color: C.textMuted, fontWeight: 650 }}>
                                        {webhooks?.total
                                            ? `Showing ${webhooks.from ?? 0}–${webhooks.to ?? 0} of ${webhooks.total} events`
                                            : 'No webhook events'}
                                    </span>

                                    <Pagination
                                        hasPrevious={!!webhooks?.prev_page_url}
                                        hasNext={!!webhooks?.next_page_url}
                                        onPrevious={() => goTo(webhooks?.prev_page_url)}
                                        onNext={() => goTo(webhooks?.next_page_url)}
                                    />
                                </div>
                            </>
                        )}
                    </Card>
                </BlockStack>
            </Page>
        </AppLayout>
    );
}
