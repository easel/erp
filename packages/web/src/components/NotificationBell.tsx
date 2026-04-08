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
import { cn } from "../lib/utils.js";

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
		<div className={cn("relative inline-block", className)}>
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={
					unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications — no unread"
				}
				onClick={() => setOpen((prev) => !prev)}
				className="relative bg-transparent border border-gray-200 rounded-md py-1.5 px-2 cursor-pointer text-base leading-none flex items-center"
			>
				<span aria-hidden="true">🔔</span>
				{unreadCount > 0 && (
					<span
						aria-hidden="true"
						className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-[0.625rem] font-bold min-w-4 h-4 flex items-center justify-center px-[0.2rem]"
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
					className="absolute top-[calc(100%+0.375rem)] right-0 w-80 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-[28rem] flex flex-col overflow-hidden"
				>
					<div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
						<span className="font-semibold text-sm text-gray-900">Notifications</span>
						{unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} unread</span>}
					</div>

					{notifications.length === 0 ? (
						<div className="py-8 px-4 text-center text-gray-500 text-sm">No notifications</div>
					) : (
						<ul className="list-none m-0 p-0 overflow-y-auto flex-1">
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
									className={cn(
										"px-4 py-3 border-b border-gray-100 flex gap-3 items-start",
										n.read ? "bg-white" : "bg-blue-50",
										n.href ? "cursor-pointer" : "cursor-default",
									)}
								>
									{!n.read && (
										<span
											aria-label="Unread"
											className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-[0.3rem]"
										/>
									)}
									<div className="flex-1 min-w-0">
										<p
											className={cn(
												"m-0 text-[0.8125rem] text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis",
												n.read ? "font-normal" : "font-semibold",
											)}
										>
											{n.subject}
										</p>
										{n.body && (
											<p className="mt-0.5 mb-0 text-xs text-gray-500 overflow-hidden line-clamp-2">
												{n.body}
											</p>
										)}
										<p className="mt-1 mb-0 text-[0.7rem] text-gray-400">
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
