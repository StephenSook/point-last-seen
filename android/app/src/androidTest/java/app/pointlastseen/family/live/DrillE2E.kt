package app.pointlastseen.family.live

/**
 * Marks tests that write to the deployed drill incident. They are left out of the
 * default connected run (build.gradle.kts notAnnotation) and run only on request:
 * -Pandroid.testInstrumentationRunnerArguments.annotation=app.pointlastseen.family.live.DrillE2E
 */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class DrillE2E
