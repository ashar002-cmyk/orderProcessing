/**
 * Dashboard.jsx - Premium MUI-like Inertia dashboard
 *
 * Drop this file into: resources/js/Pages/Dashboard.jsx
 * It keeps the existing Inertia, Polaris, shopifyUrl, AppLayout, StatusBadge,
 * and stats prop flow, but improves the layout and adds more dashboard options.
 */

import React from 'react';
import { router, usePage } from '@inertiajs/react';
import { Page, Banner, Button, BlockStack } from '@shopify/polaris';
import { shopifyUrl } from '../utils/shopifyRoute';
import AppLayout from '../Components/Layout/AppLayout';
import StatusBadge from '../Components/UI/StatusBadge';
import { T, syncStatus } from '../design/tokens';

const safeNumber = (value) => Number(value ?? 0);

const palette = {
    bg: '#F6F8FB',
    surface: '#FFFFFF',
    text: '#111827',
    textSub: '#374151',
    muted: '#6B7280',
    border: '#E5E7EB',
    softBorder: '#EEF2F7',
    shadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
    shadowSm: '0 4px 14px rgba(15, 23, 42, 0.05)',
    radius: '18px',
    radiusSm: '12px',
    blue: '#2563EB',
    green: '#059669',
    amber: '#D97706',
    red: '#DC2626',
    indigo: '#4F46E5',
    cyan: '#0891B2',
    purple: '#7C3AED',
    slate: '#475569',
};

const accentMap = {
    blue: { color: palette.blue, bg: '#EFF6FF', border: '#BFDBFE' },
    green: { color: palette.green, bg: '#ECFDF5', border: '#A7F3D0' },
    amber: { color: palette.amber, bg: '#FFFBEB', border: '#FDE68A' },
    red: { color: palette.red, bg: '#FEF2F2', border: '#FECACA' },
    indigo: { color: palette.indigo, bg: '#EEF2FF', border: '#C7D2FE' },
    cyan: { color: palette.cyan, bg: '#ECFEFF', border: '#A5F3FC' },
    purple: { color: palette.purple, bg: '#F5F3FF', border: '#DDD6FE' },
    slate: { color: palette.slate, bg: '#F8FAFC', border: '#CBD5E1' },
};

const KPI_CARDS = [
    { key: 'total_orders', title: 'Total Orders', subtitle: 'All synced Shopify orders', accent: 'blue', icon: '📦' },
    { key: 'paid_orders', title: 'Paid Orders', subtitle: 'Payment completed', accent: 'green', icon: '💳' },
    { key: 'partially_paid_orders', title: 'Partial Payments', subtitle: 'Awaiting remaining balance', accent: 'amber', icon: '◐' },
    { key: 'fulfilled_orders', title: 'Fulfilled', subtitle: 'Completed fulfillment', accent: 'cyan', icon: '✅' },
    { key: 'partially_fulfilled_orders', title: 'Partly Fulfilled', subtitle: 'Some items shipped', accent: 'indigo', icon: '🚚' },
    { key: 'created_orders', title: 'Processing', subtitle: 'Created or in progress', accent: 'slate', icon: '⚙️' },
    { key: 'cancelled_orders', title: 'Cancelled', subtitle: 'Cancelled by store/customer', accent: 'red', icon: '✕', alert: true },
    { key: 'refunded_orders', title: 'Refunded', subtitle: 'Returned payments', accent: 'purple', icon: '↩', alert: true },
    { key: 'delayed_orders', title: 'Delayed', subtitle: 'Needs operational review', accent: 'amber', icon: '⏱', alert: true },
    { key: 'failed_webhooks', title: 'Failed Webhooks', subtitle: 'Retry required', accent: 'red', icon: '⚠', alert: true },
];

const ACTIONS = [
    { label: 'View Orders', url: '/orders', icon: '📦', desc: 'Browse synced orders, filters, and timeline status', accent: 'blue' },
    { label: 'Webhook Logs', url: '/webhook-logs', icon: '🔔', desc: 'Monitor webhook deliveries and failed events', accent: 'red' },
    { label: 'Sync Logs', url: '/sync-logs', icon: '🔄', desc: 'Review background sync history and errors', accent: 'indigo' },
    { label: 'Settings', url: '/settings', icon: '⚙️', desc: 'Check store, webhook, and sync configuration', accent: 'slate' },
];

function formatDate(value) {
    if (!value) return 'Never synced';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getPercent(value, total) {
    const numericTotal = safeNumber(total);
    if (!numericTotal) return 0;
    return Math.min(100, Math.round((safeNumber(value) / numericTotal) * 100));
}

function Panel({ children, style = {} }) {
    return (
        <div
            style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: palette.radius,
                boxShadow: palette.shadowSm,
                overflow: 'hidden',
                ...style,
            }}
        >
            {children}
        </div>
    );
}

function PanelHeader({ title, subtitle, right }) {
    return (
        <div
            style={{
                padding: '18px 20px',
                borderBottom: `1px solid ${palette.softBorder}`,
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
                alignItems: 'center',
                flexWrap: 'wrap',
            }}
        >
            <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: palette.text }}>{title}</div>
                {subtitle && (
                    <div style={{ fontSize: '12.5px', color: palette.muted, marginTop: '4px' }}>{subtitle}</div>
                )}
            </div>
            {right}
        </div>
    );
}

function PremiumStatCard({ title, subtitle, value, accent = 'blue', icon, alert = false }) {
    const colors = accentMap[accent] ?? accentMap.blue;
    const [hovered, setHovered] = React.useState(false);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: palette.surface,
                border: `1px solid ${hovered ? colors.border : palette.border}`,
                borderRadius: palette.radius,
                boxShadow: hovered ? palette.shadow : palette.shadowSm,
                padding: '18px',
                minHeight: '138px',
                position: 'relative',
                transition: 'all 160ms ease',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: '0 0 auto auto',
                    width: '90px',
                    height: '90px',
                    background: colors.bg,
                    borderBottomLeftRadius: '48px',
                    opacity: 0.75,
                }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', gap: '12px' }}>
                <div
                    style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        background: colors.bg,
                        color: colors.color,
                        border: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                    }}
                >
                    {icon}
                </div>
                {alert && safeNumber(value) > 0 && (
                    <span
                        style={{
                            background: '#FEF2F2',
                            color: palette.red,
                            border: '1px solid #FECACA',
                            borderRadius: '999px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            height: 'fit-content',
                        }}
                    >
                        Attention
                    </span>
                )}
            </div>
            <div style={{ marginTop: '18px', position: 'relative' }}>
                <div style={{ fontSize: '26px', lineHeight: 1, fontWeight: 800, color: palette.text }}>
                    {safeNumber(value).toLocaleString()}
                </div>
                <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 700, color: palette.textSub }}>{title}</div>
                <div style={{ marginTop: '3px', fontSize: '12px', color: palette.muted }}>{subtitle}</div>
            </div>
        </div>
    );
}

function ProgressRow({ label, value, total, accent = 'blue' }) {
    const colors = accentMap[accent] ?? accentMap.blue;
    const percent = getPercent(value, total);

    return (
        <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: palette.textSub, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '12px', color: palette.muted }}>{percent}%</span>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        width: `${percent}%`,
                        background: colors.color,
                        borderRadius: '999px',
                        transition: 'width 220ms ease',
                    }}
                />
            </div>
        </div>
    );
}

function QuickAction({ label, url, icon, desc, accent = 'blue' }) {
    const colors = accentMap[accent] ?? accentMap.blue;
    const [hovered, setHovered] = React.useState(false);

    function visit() {
        router.visit(shopifyUrl(url));
    }

    return (
        <button
            type="button"
            onClick={visit}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${hovered ? colors.border : palette.border}`,
                background: hovered ? colors.bg : palette.surface,
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: hovered ? palette.shadowSm : 'none',
                transition: 'all 160ms ease',
            }}
        >
            <span
                style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '14px',
                    background: colors.bg,
                    color: colors.color,
                    border: `1px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                }}
            >
                {icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: palette.text }}>{label}</span>
                <span style={{ display: 'block', marginTop: '3px', fontSize: '12px', color: palette.muted }}>{desc}</span>
            </span>
            <span style={{ color: colors.color, fontWeight: 800 }}>→</span>
        </button>
    );
}

function HealthItem({ label, value, tone = 'neutral' }) {
    const colors = tone === 'danger' ? accentMap.red : tone === 'warning' ? accentMap.amber : accentMap.green;
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 0',
                borderBottom: `1px solid ${palette.softBorder}`,
            }}
        >
            <span style={{ color: palette.textSub, fontSize: '13px', fontWeight: 600 }}>{label}</span>
            <span
                style={{
                    color: colors.color,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 800,
                }}
            >
                {value}
            </span>
        </div>
    );
}

function EmptyMiniState({ title, text }) {
    return (
        <div
            style={{
                border: `1px dashed ${palette.border}`,
                borderRadius: '16px',
                padding: '18px',
                background: '#FAFBFC',
                textAlign: 'center',
            }}
        >
            <div style={{ fontSize: '13px', fontWeight: 800, color: palette.text }}>{title}</div>
            <div style={{ fontSize: '12px', color: palette.muted, marginTop: '4px' }}>{text}</div>
        </div>
    );
}

export default function Dashboard({ stats = {} }) {
    const { props } = usePage();
    const flash = props.flash ?? {};
    const [syncing, setSyncing] = React.useState(false);

    function handleSync() {
        setSyncing(true);
        router.post(shopifyUrl('/orders/sync'), {}, { preserveScroll: true, onFinish: () => setSyncing(false) });
    }

    const totalOrders = safeNumber(stats.total_orders);
    const failedWebhooks = safeNumber(stats.failed_webhooks);
    const delayedOrders = safeNumber(stats.delayed_orders);
    const cancelledOrders = safeNumber(stats.cancelled_orders);
    const syncCfg = syncStatus?.[stats.order_sync_status] ?? syncStatus?.not_started ?? { label: 'Not Started', variant: 'neutral' };
    const syncColors = T?.badge?.[syncCfg.variant] ?? T?.badge?.neutral ?? { text: palette.slate, ring: '#E2E8F0' };

    const healthTone = failedWebhooks > 0 || delayedOrders > 0 ? 'danger' : 'success';
    const healthLabel = failedWebhooks > 0 ? 'Needs Attention' : delayedOrders > 0 ? 'Review Delays' : 'Healthy';

    return (
        <AppLayout>
            <div style={{ background: palette.bg, minHeight: '100vh', paddingBottom: '28px' }}>
                <Page
                    title="Dashboard"
                    subtitle="A clear operational view of Shopify order processing, timeline events, webhooks, and sync health."
                    primaryAction={
                        <Button variant="primary" loading={syncing} onClick={handleSync}>
                            Sync Orders
                        </Button>
                    }
                    secondaryActions={[
                        { content: 'View Orders', onAction: () => router.visit(shopifyUrl('/orders')) },
                        { content: 'Webhook Logs', onAction: () => router.visit(shopifyUrl('/webhook-logs')) },
                    ]}
                >
                    <BlockStack gap="500">
                        {flash.success && <Banner tone="success"><p>{flash.success}</p></Banner>}
                        {flash.error && <Banner tone="critical"><p>{flash.error}</p></Banner>}

                        <div
                            style={{
                                background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 52%, #2563EB 100%)',
                                borderRadius: '24px',
                                boxShadow: '0 20px 50px rgba(37, 99, 235, 0.22)',
                                padding: '26px',
                                color: '#FFFFFF',
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                gap: '20px',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: 'rgba(255,255,255,0.12)',
                                        border: '1px solid rgba(255,255,255,0.18)',
                                        padding: '6px 10px',
                                        borderRadius: '999px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        marginBottom: '14px',
                                    }}
                                >
                                    <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#34D399' }} />
                                    Operational dashboard
                                </div>
                                <div style={{ fontSize: '28px', lineHeight: 1.15, fontWeight: 850, letterSpacing: '-0.03em' }}>
                                    Track every order from creation to fulfillment.
                                </div>
                                <div style={{ maxWidth: '650px', marginTop: '10px', color: 'rgba(255,255,255,0.78)', fontSize: '13.5px' }}>
                                    Monitor payment, fulfillment, webhook delivery, sync status, and processing bottlenecks from one clean dashboard.
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.18)',
                                    borderRadius: '20px',
                                    padding: '16px 18px',
                                    minWidth: '210px',
                                }}
                            >
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>System health</div>
                                <div style={{ fontSize: '22px', fontWeight: 850 }}>{healthLabel}</div>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>
                                    {failedWebhooks} failed webhooks · {delayedOrders} delayed orders
                                </div>
                            </div>
                        </div>

                        <Panel>
                            <div
                                style={{
                                    padding: '18px 20px',
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                                    gap: '18px',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                                    <div
                                        style={{
                                            width: '44px',
                                            height: '44px',
                                            borderRadius: '16px',
                                            background: accentMap.blue.bg,
                                            border: `1px solid ${accentMap.blue.border}`,
                                            color: accentMap.blue.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px',
                                        }}
                                    >
                                        🔄
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 800, color: palette.text }}>Sync Status</span>
                                            <StatusBadge status={stats.order_sync_status} />
                                        </div>
                                        <div style={{ fontSize: '12.5px', color: palette.muted, marginTop: '4px' }}>
                                            Last synced: <strong style={{ color: palette.textSub }}>{formatDate(stats.order_synced_at)}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span
                                        style={{
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '999px',
                                            background: syncColors.text,
                                            boxShadow: `0 0 0 4px ${syncColors.ring}`,
                                        }}
                                    />
                                    <span style={{ fontSize: '13px', color: palette.textSub, fontWeight: 700 }}>{syncCfg.label}</span>
                                </div>
                            </div>
                        </Panel>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                gap: '16px',
                            }}
                        >
                            {KPI_CARDS.map((item) => (
                                <PremiumStatCard
                                    key={item.key}
                                    title={item.title}
                                    subtitle={item.subtitle}
                                    value={stats[item.key]}
                                    accent={item.accent}
                                    icon={item.icon}
                                    alert={item.alert}
                                />
                            ))}
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)',
                                gap: '18px',
                                alignItems: 'start',
                            }}
                        >
                            <Panel>
                                <PanelHeader
                                    title="Order Pipeline"
                                    subtitle="High-level status distribution across synced orders"
                                    right={<span style={{ fontSize: '12px', color: palette.muted }}>{totalOrders.toLocaleString()} total</span>}
                                />
                                <div style={{ padding: '18px 20px', display: 'grid', gap: '18px' }}>
                                    {totalOrders > 0 ? (
                                        <>
                                            <ProgressRow label="Paid" value={stats.paid_orders} total={totalOrders} accent="green" />
                                            <ProgressRow label="Fulfilled" value={stats.fulfilled_orders} total={totalOrders} accent="cyan" />
                                            <ProgressRow label="Partially Fulfilled" value={stats.partially_fulfilled_orders} total={totalOrders} accent="indigo" />
                                            <ProgressRow label="Processing" value={stats.created_orders} total={totalOrders} accent="slate" />
                                            <ProgressRow label="Cancelled" value={cancelledOrders} total={totalOrders} accent="red" />
                                        </>
                                    ) : (
                                        <EmptyMiniState title="No orders synced yet" text="Click Sync Orders to fetch Shopify orders and build timeline data." />
                                    )}
                                </div>
                            </Panel>

                            <Panel>
                                <PanelHeader title="Operational Health" subtitle="Issues that need attention" />
                                <div style={{ padding: '4px 20px 18px' }}>
                                    <HealthItem
                                        label="Webhook failures"
                                        value={failedWebhooks > 0 ? `${failedWebhooks} failed` : 'Clear'}
                                        tone={failedWebhooks > 0 ? 'danger' : 'success'}
                                    />
                                    <HealthItem
                                        label="Delayed orders"
                                        value={delayedOrders > 0 ? `${delayedOrders} delayed` : 'Clear'}
                                        tone={delayedOrders > 0 ? 'warning' : 'success'}
                                    />
                                    <HealthItem
                                        label="Cancelled orders"
                                        value={cancelledOrders > 0 ? `${cancelledOrders} found` : 'Clear'}
                                        tone={cancelledOrders > 0 ? 'warning' : 'success'}
                                    />
                                    <div style={{ paddingTop: '14px' }}>
                                        <Button fullWidth onClick={() => router.visit(shopifyUrl('/webhook-logs'))}>
                                            Review Webhook Logs
                                        </Button>
                                    </div>
                                </div>
                            </Panel>
                        </div>

                        <Panel>
                            <PanelHeader title="Quick Actions" subtitle="Most-used operational shortcuts" />
                            <div
                                style={{
                                    padding: '18px 20px 20px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                    gap: '14px',
                                }}
                            >
                                {ACTIONS.map((action) => (
                                    <QuickAction key={action.url} {...action} />
                                ))}
                            </div>
                        </Panel>
                    </BlockStack>
                </Page>
            </div>
        </AppLayout>
    );
}
