package app.pointlastseen.family

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.IntentCompat
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

    override fun onCreate(savedInstanceState: Bundle?) {
        // Dark system icons on the light paper background.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handleShare(intent)
        setContent {
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /** A clip shared from a camera or gallery app opens the clip screen; file:// and this app's own URIs are refused. */
    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("video/") != true) return
        val uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: return
        if (vm.pickedClip(uri)) vm.open(Screen.CLIP)
    }
}
