package app.pointlastseen.family.ai

import app.pointlastseen.family.core.Colors
import app.pointlastseen.family.core.ExitEdge
import app.pointlastseen.family.core.Legibility
import app.pointlastseen.family.core.Lighting
import com.google.firebase.ai.type.Schema

/** Closed response schemas: models only fill these; code validates every field. */
object AiSchemas {
    private val edges = ExitEdge.entries.map { it.wire }

    val clip: Schema = Schema.obj(
        mapOf(
            "personVisible" to Schema.boolean(),
            "firstSeen" to Schema.string("MM:SS from the clip start when the person first appears"),
            "lastSeen" to Schema.string("MM:SS from the clip start when the person is last visible"),
            "entryEdge" to Schema.enumeration(edges),
            "exitEdge" to Schema.enumeration(edges, "the frame edge they leave by, or the direction they walk"),
            "topColor" to Schema.enumeration(Colors.ALL),
            "bottomColor" to Schema.enumeration(Colors.ALL),
            "topType" to Schema.string(),
            "footwear" to Schema.string(),
            "headwear" to Schema.string(),
            "carriedItems" to Schema.array(Schema.string(), maxItems = 3),
            "keyFrame" to Schema.obj(
                mapOf(
                    "time" to Schema.string("MM:SS of the clearest frame"),
                    "box2d" to Schema.array(Schema.integer(), "[yMin, xMin, yMax, xMax] on a 0 to 1000 scale", minItems = 4, maxItems = 4),
                ),
            ),
            "lighting" to Schema.enumeration(Lighting.entries.map { it.wire }),
            "legibility" to Schema.enumeration(Legibility.entries.map { it.wire }),
            "evidence" to Schema.string("one sentence on what is visible"),
        ),
    )

    const val CLIP_PROMPT =
        "This is a short home-camera clip from a training drill. Describe one adult walking through the view: " +
            "when they first and last appear, which frame edge they enter and leave by (toward_camera or " +
            "away_from_camera when they walk along the view), their clothing colors from the closed list, " +
            "what they carry, the clearest frame with a box around the person, the lighting, and how legible the clip is. " +
            "Do not describe the face. Do not guess who the person is. Use unknown when you cannot tell."
}
