package app.pointlastseen.family.config

import com.google.firebase.remoteconfig.ConfigUpdate
import com.google.firebase.remoteconfig.ConfigUpdateListener
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Where Remote Config values come from; the Firebase one listens in real time. */
interface RcSource {
    fun snapshot(): Map<String, String>
    fun start(onChange: () -> Unit)
}

/** The app's live Remote Config values, defaults until the first activation. */
class RcStore(private val source: RcSource) {
    private val state = MutableStateFlow(RcValues.DEFAULTS)
    val values: StateFlow<RcValues> = state

    fun current(): RcValues = state.value

    fun start() {
        publish()
        source.start { publish() }
    }

    private fun publish() {
        state.value = RcValues.from(source.snapshot())
    }
}

/** Firebase Remote Config with in-app defaults, a fetch at start and a real-time listener. */
class FirebaseRcSource(private val remote: FirebaseRemoteConfig) : RcSource {
    override fun snapshot(): Map<String, String> = remote.all.mapValues { it.value.asString() }

    override fun start(onChange: () -> Unit) {
        remote.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 300 })
        remote.setDefaultsAsync(RcValues.DEFAULT_MAP).addOnCompleteListener { onChange() }
        remote.fetchAndActivate().addOnCompleteListener { onChange() }
        remote.addOnConfigUpdateListener(object : ConfigUpdateListener {
            override fun onUpdate(configUpdate: ConfigUpdate) {
                remote.activate().addOnCompleteListener { onChange() }
            }

            override fun onError(error: FirebaseRemoteConfigException) {
                // The last activated values stay in force; the banner reads them.
            }
        })
    }
}
