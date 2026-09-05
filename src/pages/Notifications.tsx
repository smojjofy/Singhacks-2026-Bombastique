import { demoStore, useDemoStore } from "../store/demoStore"
import { EmptyState, formatDate } from "../components/ui"

export function NotificationsPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const inbox = state.notifications
    .filter((n) => n.recipientId === current.id)
    .slice()
    .sort((a, b) => b.at - a.at)
  const unread = inbox.filter((n) => !n.read).length

  return (
    <section className="page">
      <p className="eyebrow">INBOX</p>
      <h1>Notifications</h1>
      <p className="lead">
        Persistent, recipient-specific notifications for {current.name}.{" "}
        {unread > 0 ? `${unread} unread.` : "All caught up."}
      </p>

      {unread > 0 && (
        <button
          className="secondary"
          onClick={() => demoStore.dispatch({ type: "markAllRead", actorId: current.id })}
        >
          Mark all as read
        </button>
      )}

      {inbox.length === 0 ? (
        <EmptyState>No notifications for this persona yet.</EmptyState>
      ) : (
        <div className="notif-list">
          {inbox.map((n) => (
            <button
              key={n.id}
              className={`notif ${n.read ? "" : "notif-unread"}`}
              onClick={() => demoStore.dispatch({ type: "markRead", actorId: current.id, notificationId: n.id })}
            >
              <span className="notif-dot" aria-hidden />
              <div className="notif-body">
                <b>{n.message}</b>
                <small>{formatDate(n.at)}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
