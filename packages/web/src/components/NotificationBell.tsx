/**
 * NotificationBell — in-app notification indicator in the root layout.
 *
 * Design rules (ADR-011 PLT-019, PLT-008):
 *  - Bell icon with unread count badge.
 *  - Click to open notification panel (dropdown or drawer).
 *  - Shows read/unread status per notification.
 *  - Caller supplies notifications and mark-read callback.
 *
 * Accessibility: WCAG 2.1 AA — button with aria-label including count,
 * aria-live region announces new notifications.
 *
 * @example
 * <NotificationBell
 *   notifications={userNotifications}
 *   onMarkRead={(id) => markNotificationRead(id)}
 *   onNavigate={(href) => router.push(href)}
 * />
 */

import type React from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface AppNotification {
	id: string;
	/** Short subject line. */
	subject: string;
	/** Optional longer body text. */
	body?: string;
	/** Whether the notification has been read. */
	read: boolean;
	/** When the notification was created. */
	createdAt: Date;
	/** Optional navigation target when user clicks the notification. */
	href?: string;
}

export interface NotificationBellProps {
	notifications: AppNotification[];
	/** Called when the user marks a notification as read. */
	onMarkRead: (id: string) => void;
	/** Called when the user clicks a notification with an href. */
	onNavigate?: (href: string) => void;
	/** Additional CSS class names. */
	className?: string;
}

function formatRelative(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	return date.toLocaleDateString();
}

/**
 * NotificationBell renders a bell button with unread count and expandable panel.
 */
export function NotificationBell({
	notifications,
	onMarkRead,
	onNavigate,
	className,
}: NotificationBellProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLElement>(null);
	const panelId = useId();

	const unreadCount = notifications.filter((n) => !n.read).length;

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				!buttonRef.current?.contains(e.target as Node) &&
				!panelRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const handleNotificationClick = (n: AppNotification) => {
		onMarkRead(n.id);
		if (n.href && onNavigate) {
			setOpen(false);
			onNavigate(n.href);
		}
	};

	return (
		<div style={{ position: "relative", display: "inline-block" }} className={className}>
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={
					unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications — no unread"
				}
				onClick={() => setOpen((prev) => !prev)}
				style={{
					position: "relative",
					background: "transparent",
					border: "1px solid #e5e7eb",
					borderRadius: "0.375rem",
					padding: "0.375rem 0.5rem",
					cursor: "pointer",
					fontSize: "1rem",
					lineHeight: 1,
					display: "flex",
					alignItems: "center",
				}}
			>
				<span aria-hidden="true">🔔</span>
				{unreadCount > 0 && (
					<span
						aria-hidden="true"
						style={{
							position: "absolute",
							top: "-0.25rem",
							right: "-0.25rem",
							background: "#ef4444",
							color: "#fff",
							borderRadius: "9999px",
							fontSize: "0.625rem",
							fontWeight: 700,
							minWidth: "1rem",
							height: "1rem",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "0 0.2rem",
						}}
					>
						{unreadCount > 99 ? "99+" : unreadCount}
					</span>
				)}
			</button>

			{/* Notification panel — use <section> for role="region" with aria-label */}
			{open && (
				<section
					ref={panelRef}
					id={panelId}
					aria-label="Notifications"
					aria-live="polite"
					style={{
						position: "absolute",
						top: "calc(100% + 0.375rem)",
						right: 0,
						width: "20rem",
						background: "#fff",
						border: "1px solid #d1d5db",
						borderRadius: "0.5rem",
						boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
						zIndex: 50,
						maxHeight: "28rem",
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							padding: "0.75rem 1rem",
							borderBottom: "1px solid #e5e7eb",
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
						}}
					>
						<span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827" }}>
							Notifications
						</span>
						{unreadCount > 0 && (
							<span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{unreadCount} unread</span>
						)}
					</div>

					{notifications.length === 0 ? (
						<div
							style={{
								padding: "2rem 1rem",
								textAlign: "center",
								color: "#6b7280",
								fontSize: "0.875rem",
							}}
						>
							No notifications
						</div>
					) : (
						<ul
							style={{
								listStyle: "none",
								margin: 0,
								padding: 0,
								overflowY: "auto",
								flex: 1,
							}}
						>
							{notifications.map((n) => (
								<li
									key={n.id}
									onClick={() => handleNotificationClick(n)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleNotificationClick(n);
										}
									}}
									role={n.href ? "button" : undefined}
									tabIndex={n.href ? 0 : undefined}
									style={{
										padding: "0.75rem 1rem",
										borderBottom: "1px solid #f3f4f6",
										background: n.read ? "#fff" : "#eff6ff",
										cursor: n.href ? "pointer" : "default",
										display: "flex",
										gap: "0.75rem",
										alignItems: "flex-start",
									}}
								>
									{!n.read && (
										<span
											aria-label="Unread"
											style={{
												width: "0.5rem",
												height: "0.5rem",
												borderRadius: "50%",
												background: "#3b82f6",
												flexShrink: 0,
												marginTop: "0.3rem",
											}}
										/>
									)}
									<div style={{ flex: 1, minWidth: 0 }}>
										<p
											style={{
												margin: 0,
												fontSize: "0.8125rem",
												fontWeight: n.read ? 400 : 600,
												color: "#111827",
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{n.subject}
										</p>
										{n.body && (
											<p
												style={{
													margin: "0.125rem 0 0",
													fontSize: "0.75rem",
													color: "#6b7280",
													overflow: "hidden",
													display: "-webkit-box",
													WebkitLineClamp: 2,
													WebkitBoxOrient: "vertical",
												}}
											>
												{n.body}
											</p>
										)}
										<p
											style={{
												margin: "0.25rem 0 0",
												fontSize: "0.7rem",
												color: "#9ca3af",
											}}
										>
											{formatRelative(n.createdAt)}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</div>
	);
}
