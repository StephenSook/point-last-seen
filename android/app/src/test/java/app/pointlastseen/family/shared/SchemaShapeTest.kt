package app.pointlastseen.family.shared

import app.pointlastseen.family.core.CameraSighting
import app.pointlastseen.family.core.ExitEdge
import app.pointlastseen.family.core.KeyFrame
import app.pointlastseen.family.core.Legibility
import app.pointlastseen.family.core.Lighting
import app.pointlastseen.family.data.EventContext
import app.pointlastseen.family.data.Events
import app.pointlastseen.family.data.FamilySightingInput
import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.data.SubjectProfile
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** The maps this app writes carry exactly the property names of the shared schemas. */
class SchemaShapeTest {
    private fun props(file: String, def: String? = null): Set<String> {
        var o: JsonObject = SharedFiles.json("shared/schemas/$file")
        if (def != null) o = o["\$defs"]!!.jsonObject[def]!!.jsonObject
        return o["properties"]!!.jsonObject.keys
    }

    private val ctx = EventContext("inc-1", "dev-1", "uid-1", 1, 1_000_000L) { 1L }

    @Test fun eventDocMatchesTheEventSchema() {
        val e = Events.familySighting(FamilySightingInput(900_000L, null, "x", "n", "blue", "black", "", "", "note"), ctx)
        assertEquals(props("event.schema.json"), e.toMap().keys)
    }

    @Test fun familySightingReadingMatchesTheReportReadingSchema() {
        val e = Events.familySighting(FamilySightingInput(900_000L, null, "x", "n", "blue", "black", "", "", "note"), ctx)
        assertEquals(props("report-reading.schema.json"), e.reading!!.keys)
    }

    @Test fun routeRecordMatchesItsSchema() {
        val r = RouteRecord("android", "cloud", "sdk", "m", "sdk_only_in_cloud", 1, true, null, 2)
        assertEquals(props("route-record.schema.json"), r.toMap().keys)
    }

    @Test fun cameraSightingMatchesItsSchema() {
        val s = CameraSighting(true, "00:01", "00:02", ExitEdge.LEFT, ExitEdge.RIGHT, "blue", "black", "", "", "", listOf(), KeyFrame("00:01", listOf(1, 2, 3, 4)), Lighting.DAY, Legibility.CLEAR, "")
        assertEquals(props("camera-sighting.schema.json"), s.toMap().keys)
    }

    private fun fields(c: Class<*>): Set<String> =
        c.declaredFields.filter { !java.lang.reflect.Modifier.isStatic(it.modifiers) }.map { it.name }.toSet()

    @Test fun kotlinTypesCarryTheSchemaFieldNames() {
        assertEquals(props("event.schema.json"), fields(app.pointlastseen.family.data.EventDoc::class.java))
        assertEquals(props("route-record.schema.json"), fields(RouteRecord::class.java))
        assertEquals(props("camera-sighting.schema.json"), fields(CameraSighting::class.java))
        assertEquals(props("subject-profile.schema.json", "SharedProfile"), fields(app.pointlastseen.family.data.SharedProfile::class.java))
        assertEquals(props("subject-profile.schema.json", "CommandProfile"), fields(app.pointlastseen.family.data.CommandProfile::class.java))
    }

    @Test fun sharedAndCommandProfilesMatchTheirSchemas() {
        assertEquals(props("subject-profile.schema.json", "SharedProfile"), Profiles.forSearchers(SubjectProfile()).toMap().keys)
        assertEquals(props("subject-profile.schema.json", "CommandProfile"), Profiles.forCommand(SubjectProfile()).toMap().keys)
    }
}
