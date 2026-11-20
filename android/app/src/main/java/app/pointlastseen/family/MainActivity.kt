package app.pointlastseen.family

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.core.content.IntentCompat
import app.pointlastseen.family.push.NotificationAsk
import app.pointlastseen.family.ui.Copy
import app.pointlastseen.family.ui.FamilyRoot
import app.pointlastseen.family.ui.Screen
import app.pointlastseen.family.ui.theme.PaperTheme

class MainActivity : ComponentActivity() {
    private val vm: FamilyViewModel by viewModels()

    private val pickClip = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { vm.pickedClip(it) }
    }
    private val pickPhotos = registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        vm.pickedPhotos(uris)
    }
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Once, after joining a search: the search lead's question and the search notices need this permission. */
    private fun askForNotificationsIfDue(joined: Boolean) {
        val prefs = getSharedPreferences("pls-notifications", MODE_PRIVATE)
        val granted = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!NotificationAsk.shouldAsk(Build.VERSION.SDK_INT, granted, joined, prefs.getBoolean("asked", false))) return
        prefs.edit().putBoolean("asked", true).apply()
        askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Dark system icons on the light paper background.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            handleShare(intent)
            handleFamilyQuestion(intent)
        }
        setContent {
            LaunchedEffect(vm.nav.joined) { askForNotificationsIfDue(vm.nav.joined) }
            PaperTheme {
                FamilyRoot(
                    vm,
                    onPickClip = { pickClip.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                    onPickPhotos = { pickPhotos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    onDial = { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:911"))) },
                    onOpenDownloads = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Copy.DOWNLOAD_PAGE))) },
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        vm.onForeground()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
        handleFamilyQuestion(intent)
    }

    /**
     * A tapped "The search lead has a question" opens the newest unanswered question listed on the server.
     * No question id is ever taken from the push: any installation can subscribe to a topic.
     */
    private fun handleFamilyQuestion(intent: Intent?) {
        if (intent?.getStringExtra("kind") != "question") return
        val incident = intent.getStringExtra("incidentId") ?: return
        vm.questionPushOpened(incident)
    }

    /** A clip shared from a camera or gallery app opens the clip screen; file:// and this app's own URIs are refused. */
    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("video/") != true) return
        val uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: return
        if (vm.pickedClip(uri)) vm.open(Screen.CLIP)
    }
}
