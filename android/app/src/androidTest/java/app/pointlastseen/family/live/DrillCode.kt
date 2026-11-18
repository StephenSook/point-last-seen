package app.pointlastseen.family.live

import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue

/**
 * The drill family's join code, read from a file on the device (instrumentation argument
 * plsJoinCodeFile; run-drill-e2e.sh writes it from the Keychain through a pipe). The code is never a
 * command-line argument and is never logged. The file is read through the shell, which can read
 * /data/local/tmp where the app cannot.
 */
object DrillCode {
    fun read(): String {
        val path = InstrumentationRegistry.getArguments().getString("plsJoinCodeFile")
        assertTrue("run through android/run-drill-e2e.sh (it passes plsJoinCodeFile)", !path.isNullOrEmpty())
        val pfd = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("cat $path")
        val code = ParcelFileDescriptor.AutoCloseInputStream(pfd).use { it.readBytes().decodeToString() }.trim()
        assertTrue("the join code file is empty", code.isNotEmpty())
        return code
    }
}
