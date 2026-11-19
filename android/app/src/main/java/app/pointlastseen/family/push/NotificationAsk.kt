package app.pointlastseen.family.push

/**
 * When to ask for the notification permission: once, after the family joins a search, on Android 13
 * and later (where the app needs it to show the search lead's question and the search notices).
 */
object NotificationAsk {
    fun shouldAsk(sdk: Int, granted: Boolean, joined: Boolean, askedBefore: Boolean): Boolean =
        sdk >= 33 && joined && !granted && !askedBefore
}
