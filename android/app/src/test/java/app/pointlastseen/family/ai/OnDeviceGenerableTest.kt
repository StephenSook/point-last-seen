package app.pointlastseen.family.ai

import java.util.ServiceLoader
import kotlin.reflect.KClass
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * On a phone, ML Kit reads a @Generable reply through the KSP-generated providers listed in
 * META-INF/services. Every field must be a basic type or another registered @Generable type, or ML Kit
 * refuses the request before the model runs ("NoteKind is neither a registered @Generable type nor a
 * directly supported basic type"). The cloud path takes the same reply as a JSON schema and never checks
 * this, so without this test the fault only shows on a phone with an on-device model.
 */
class OnDeviceGenerableTest {
    // ML Kit's provider type is runtime-only for this module, so it is reached by name.
    private val providerType = Class.forName("com.google.mlkit.genai.schema.guided.GenerableProvider")
    private val basic = setOf("java.lang.String", "java.lang.Integer", "java.lang.Long", "java.lang.Float", "java.lang.Double", "java.lang.Boolean")

    private fun call(o: Any, name: String): Any? = o.javaClass.getMethod(name).invoke(o)

    private fun target(p: Any) = call(p, "getTargetClass") as KClass<*>

    private fun providers(): List<Any> = ServiceLoader.load(providerType, javaClass.classLoader).toList()

    /** The fields of the registered types that ML Kit cannot read, as "Type.field: FieldType". */
    private fun unreadable(providers: List<Any>): List<String> {
        val registered = providers.map { target(it).javaObjectType.name }.toSet()
        return providers.flatMap { p ->
            @Suppress("UNCHECKED_CAST")
            val fields = call(call(p, "getGenerableDetail")!!, "getGuideDetails") as List<Any>
            fields.mapNotNull { f ->
                val list = call(f, "isList") as Boolean
                val type = (call(f, if (list) "getListItemType" else "getType") as KClass<*>).javaObjectType.name
                if (type in basic || type in registered) null else "${target(p).java.simpleName}.${call(f, "getName")}: $type"
            }
        }
    }

    @Test fun everyOnDeviceReplyFieldIsABasicOrRegisteredType() {
        val ps = providers()
        val names = ps.map { target(it).java.simpleName }
        assertTrue("the note reply's provider is not registered: $names", "NoteReply_MlKitCompanion" in names)
        val bad = unreadable(ps)
        assertTrue("ML Kit cannot read these fields on a phone:\n${bad.joinToString("\n")}", bad.isEmpty())
    }
}
