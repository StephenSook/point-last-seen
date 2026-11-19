package app.pointlastseen.family.push

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import app.pointlastseen.family.MainActivity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.flow.MutableSharedFlow

/** Family notices this process received, for the live test. Ids only. */
object FamilyPushInbox {
    val received = MutableSharedFlow<FamilyNotice>(replay = 16, extraBufferCapacity = 16)
}

/** Plan pushes this process received, for the screens and the live test. Ids only. */
object PlanPushInbox {
    val received = MutableSharedFlow<PlanPushData>(replay = 16, extraBufferCapacity = 16)
}

/**
 * Receives command's plan pushes. In the foreground the app shows the notification itself; in the
 * background FCM shows it on the [PlanPush.CHANNEL_ID] channel. The message carries ids only, so
 * nothing private is logged or shown. The FCM token is never logged or sent: pushes go to topics.
 */
class PlsMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        FamilyPush.parse(message.data)?.let { notice ->
            val question = (notice as? FamilyNotice.Question)?.questionId?.let { " question=$it" } ?: ""
            Log.i(TAG, "family push kind=${message.data["kind"]} incident=${notice.incidentId}$question")
            FamilyPushInbox.received.tryEmit(notice)
            showFamily(this, message.notification?.title ?: FAMILY_TITLE, notice, message.data)
            return
        }
        val push = PlanPush.parse(message.data) ?: return
        Log.i(TAG, "plan push incident=${push.incidentId} team=${push.teamId} version=${push.planVersion}")
        PlanPushInbox.received.tryEmit(push)
        show(this, message.notification?.title ?: DEFAULT_TITLE, message.notification?.body ?: DEFAULT_BODY, push.incidentId.hashCode())
    }

    override fun onNewToken(token: String) = Unit

    companion object {
        const val TAG = "PLS-PUSH"
        const val DEFAULT_TITLE = "New assignment"
        const val DEFAULT_BODY = "Your team has a new task. Open Point Last Seen to see it."
        const val FAMILY_TITLE = "Point Last Seen"

        /**
         * A family notice in the foreground, with the fixed words. Tapping it opens the app with the
         * push's own data keys (kind, incidentId, questionId), the same extras FCM sets when it shows
         * the notice itself in the background, so one handler opens the question either way.
         */
        private fun showFamily(context: Context, title: String, notice: FamilyNotice, data: Map<String, String>) {
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            for (k in listOf("kind", "incidentId", "questionId")) data[k]?.let { intent.putExtra(k, it) }
            val id = (notice.incidentId + "-family").hashCode()
            val open = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = Notification.Builder(context, PlanPush.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle(title).setContentText(FamilyPush.body(notice)).setContentIntent(open).setAutoCancel(true).build()
            context.getSystemService(NotificationManager::class.java)?.notify(id, n)
        }

        /** The channel plan pushes use; made at app start. */
        fun createChannel(context: Context) {
            val channel = NotificationChannel(PlanPush.CHANNEL_ID, "Assignments", NotificationManager.IMPORTANCE_HIGH)
            context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }

        private fun show(context: Context, title: String, body: String, id: Int) {
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            val open = PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = Notification.Builder(context, PlanPush.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle(title).setContentText(body).setContentIntent(open).setAutoCancel(true).build()
            context.getSystemService(NotificationManager::class.java)?.notify(id, n)
        }
    }
}
