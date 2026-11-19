import FirebaseAuth
import FirebaseFirestore
import Foundation
import Observation
import PLSCore

/// The searcher phone's state and its one action: send a report.
@MainActor
@Observable
final class AppModel {
    let connectivity = ConnectivityMonitor()
    let location = LocationProvider()
    let gate = LiveGateBox(LiveGate(networkOnline: false, cloudConsent: false, killCloud: false, incidentMode: nil))
    let signIn: SignIn
    private(set) var signedIn = false

    /// This build's version (CFBundleShortVersionString), compared with `minimum_version_ios`.
    let appVersion: String

    /// Speaks new assignments (on-device voice, or the AI Logic voice when Remote Config names one).
    let speaker: AssignmentSpeaker

    /// The signed-in uid (the device id in event ids) and the clock; seams for tests.
    private let uid: () -> String?
    private let nowMs: () -> Double

    /// Reads one report. It runs only after sign-in succeeded (see `send`); the default reads on
    /// Apple's model and, when allowed, Gemini through Firebase AI Logic.
    typealias ReadReport = @MainActor (String, ReportSituation, RemoteConfigValues, EvidenceScreen) async -> ReadOutcome
    private let readReport: ReadReport

    /// The joinIncident callable and Auth's claims, and where the mission is read from; seams for tests.
    private let joinBackend: JoinBackend
    private let missionReader: MissionReader
    /// The team's push topic this phone follows; nil until a subscription has gone through.
    private let pushTopics: PushTopics
    @ObservationIgnored private var subscribedTopic: String?
    /// The latest topic change in flight. FCM refuses a subscription made before the phone has its
    /// token (it is tried again when the token arrives), and a subscription can be slow with no
    /// signal, so nothing else ever waits for it.
    @ObservationIgnored private(set) var topicFollow: Task<Void, Never>?
    /// The access check started by a return to the foreground.
    @ObservationIgnored private(set) var foregroundCheck: Task<Void, Never>?
    /// The assignment voice in flight. Speaking takes seconds (longer on the cloud voice), so the plan
    /// listener, the topic and the alerts question never wait for it; voices keep their order.
    @ObservationIgnored private(set) var speech: Task<Void, Never>?
    /// Notification permission, and where "asked once" is kept.
    private let alerts: AlertPermission
    private let defaults: UserDefaults
    static let alertsAskedKey = "pls.alertsAsked"
    static let topicsKey = "pls.pushTopics"
    /// True while the one-time alerts question should show (after a join, before an answer).
    private(set) var offersAlerts = false
    /// Counts taps on new-assignment pushes; the screen returns to the task on each.
    private(set) var openTaskRequests = 0
    /// The join screen's words after a try; nil while there is nothing to say.
    private(set) var joinMessage: String?
    private(set) var joining = false
    /// Stops listening for the loaded mission's plans.
    @ObservationIgnored private var stopPlanWatch: (@Sendable () -> Void)?
    /// Names the plan listener in place: a callback from a retired one (queued before it stopped)
    /// is ignored, also after a move away and back to the same team.
    @ObservationIgnored private var planWatchId = 0
    /// Counts mission loads and joins; only the newest installs a mission.
    @ObservationIgnored private var missionGeneration = 0
    /// The incident and team the server's claims grant this phone, kept when the mission could not
    /// be read, so it can be read again without sending the code again.
    private var membership: (incidentId: String, teamId: String)?
    /// True when the phone is in an incident but its mission is not loaded yet.
    var canRetryMission: Bool { membership != nil && mission == nil }
    static let missionUnread = "Joined, but the mission could not be read. Check the connection and try again."
    static let notOnATeam = "This phone is no longer on a team. Ask command for a join code."

    init(signIn: SignIn = .firebase(),
         appVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
         speaker: AssignmentSpeaker? = nil,
         uid: @escaping () -> String? = { Auth.auth().currentUser?.uid },
         nowMs: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
         measurements: MeasurementWriter? = nil,
         readReport: ReadReport? = nil,
         joinBackend: JoinBackend? = nil,
         missionReader: MissionReader? = nil,
         pushTopics: PushTopics? = nil,
         alerts: AlertPermission? = nil,
         defaults: UserDefaults = .standard) {
        self.signIn = signIn
        self.joinBackend = joinBackend ?? FirebaseJoinBackend(signIn: { await signIn.ensure() })
        self.missionReader = missionReader ?? FirestoreMissionReader()
        self.pushTopics = pushTopics ?? FirebasePushTopics()
        self.alerts = alerts ?? SystemAlerts()
        self.defaults = defaults
        self.appVersion = appVersion
        self.speaker = speaker ?? AssignmentSpeaker()
        self.uid = uid
        self.nowMs = nowMs
        self.measurements = measurements
        self.readReport = readReport ?? { text, situation, config, screen in
            await ReportReader(ai: AIClient.make(useLimitedUseTokens: config.useLimitedUseTokens), config: config, screen: screen)
                .read(text, situation: situation)
        }
    }

    /// Writes each report's timings; Firestore unless a test supplies one.
    private var measurements: MeasurementWriter?
    /// The posterior over the team's segments, recomputed after every report (the map draws it).
    private(set) var posterior: PosteriorResult?

    /// Uses a journal and identity made elsewhere (tests).
    func attach(store: EventStore, identity: DeviceIdentity, screen: EvidenceScreen? = nil) {
        self.store = store
        self.identity = identity
        if let screen { self.screen = screen }
    }

    /// True for 5 seconds after this phone sent a report, until it is undone.
    func canUndo(_ eventId: String) -> Bool {
        guard let entries = store?.entries, let entry = entries.first(where: { $0.eventId == eventId }),
              entry.doc.type != .retraction, entry.doc.authorUid == uid(),
              !entries.contains(where: { $0.doc.type == .retraction && $0.doc.targetEventId == eventId }) else { return false }
        return ReadOutcomeBuilder.canUndo(sentAtMs: entry.doc.clientTimeMs, nowMs: nowMs())
    }

    /// Undo is a new `retraction` event that targets the report; the report itself is never edited.
    func undo(_ eventId: String) {
        guard canUndo(eventId), let store, let identity, let uid = uid(),
              let entry = store.entries.first(where: { $0.eventId == eventId }) else { return }
        do {
            let retraction = try ReadOutcomeBuilder.retraction(of: entry.doc, authorUid: uid, deviceId: uid,
                                                               seq: try identity.nextSeq(), clientTimeMs: nowMs())
            try store.append(retraction)
            problem = nil
        } catch {
            problem = "The undo was not saved on this phone. Try again."
        }
    }

    /// The urgency chip on the approach card, from the incident's conditions (search urgency only).
    var urgency: UrgencyLevel {
        guard let rule = try? BundledConstants.urgencyRule() else { return .none }
        return rule.level(conditions: mission?.conditions)
    }

    /// The header's link glyph: signal and reports still on this phone.
    var linkState: LinkState {
        let waiting = store?.entries.filter { $0.state == .pending || $0.state == .checking }.count ?? 0
        return LinkState.make(online: connectivity.isOnline, waiting: waiting)
    }

    /// This phone's reports for the loaded mission's incident only; the journal keeps every report
    /// (an earlier incident's stay there for recovery) but a mission never lists or counts another's.
    var missionEntries: [OutboxEntry] {
        guard let incidentId = mission?.incidentId else { return [] }
        return store?.entries.filter { $0.doc.incidentId == incidentId } ?? []
    }

    /// What the Live Activity shows; nil while no pack is loaded.
    var taskStatus: TaskStatus? {
        mission.map { TaskStatus.make(assignedSegmentIds: $0.assignedSegmentIds, states: missionEntries.map(\.state)) }
    }

    /// Shown when command has raised the minimum version above this build. It asks, it does not
    /// block: a searcher in the field can still send reports on an old build.
    var updatePrompt: String? {
        config.needsUpdate(appVersion: appVersion)
            ? "Update this app. Command needs version \(config.minimumVersionIOS) or newer. Reports still send." : nil
    }
    /// Remote Config values. Read at the moment of each send, and a change reaches the live
    /// gate at once, so a kill-switch flip takes effect without a restart.
    var config = RemoteConfigValues.defaults { didSet { refreshGate() } }
    var cloudConsent = false { didSet { refreshGate() } }
    private(set) var mission: Mission?
    private(set) var store: EventStore?
    private(set) var sending = false
    /// The last GPS fix this phone got; the screen theme uses it to know when it is dusk here.
    private(set) var lastFix: Position?
    var problem: String?
    private var identity: DeviceIdentity?
    private var screen: EvidenceScreen?

    private var started = false
    private var remoteConfig: RemoteConfigStore?
    private var wasOnline = false

    func start() {
        guard !started else { return }
        started = true
        connectivity.onChange = { [weak self] in self?.connectivityChanged() }
        connectivity.start()
        let remoteConfig = RemoteConfigStore()
        remoteConfig.onChange = { [weak self] in self?.config = $0 }
        remoteConfig.start()
        self.remoteConfig = remoteConfig
        Task { await self.trySignIn() }
        // Each failure gets its own message, so the person and command know what to fix.
        do { identity = try DeviceIdentity() } catch {
            problem = "This phone could not start its report numbering. Tell command."
        }
        do { screen = try BundledConstants.evidenceScreen() } catch {
            problem = "This app is missing its evidence word list. Reinstall the app."
        }
        do {
            let store = try EventStore(server: FirestoreEventServer(db: Firestore.firestore()),
                                       outboxURL: DeviceIdentity.storeDirectory().appendingPathComponent("outbox.json"))
            if store.damagedJournal != nil {
                problem = "A damaged report journal was set aside. Reports from before may need to be sent again."
            }
            store.reconcileUnresolved()
            self.store = store
        } catch {
            problem = "This phone could not open its report journal. Tell command."
        }
    }

    /// Back in signal: settle every report that has no answer yet.
    func connectivityChanged() {
        refreshGate()
        let online = connectivity.isOnline
        if online && !wasOnline {
            store?.reconcileUnresolved()
            Task { await trySignIn() }
        }
        wasOnline = online
    }

    func trySignIn() async {
        signedIn = await signIn.ensure()
        if signedIn {
            // The account changed since the mission was read: nothing of it is this user's.
            if let mission, mission.ownerUid != uid() { await dropMission() }
            await resumeMission()
            return
        }
        // No user at all (signed out, for example after the account was removed) and the sign-in
        // failed: what this phone holds belonged to a user that is gone. A cached user (offline)
        // counts as signed in, so offline use keeps its mission.
        if !signIn.signedIn, mission != nil || membership != nil { await dropMission() }
    }

    /// Counts the join, retry and sign-in checks of this phone's access. Each takes a number when it
    /// starts, and only the newest acts on the claims it read or says anything, so a slow check
    /// that returns old searcher claims never restores what a newer check dropped.
    @ObservationIgnored private var accessCheck = 0

    /// Joins as a searcher with the code and team command gave, then loads the team's mission.
    func join(code: String, teamId: String, incidentId: String) async {
        joining = true
        defer { joining = false }
        // A join is the newest wish: any load or check still running from before must not replace it.
        missionGeneration += 1
        accessCheck += 1
        let check = accessCheck
        let request: SearcherJoin
        do {
            request = try SearcherJoin.make(code: code, teamId: teamId, incidentId: incidentId)
        } catch {
            joinMessage = (error as? SearcherJoin.InputError)?.message ?? Joiner.other
            return
        }
        // Already in this team (and incident, when named): read the mission, do not spend the code.
        let current = await joinBackend.currentClaims(forceRefresh: true)
        guard check == accessCheck else { return }
        if let claims = current, claims["role"] == .string("searcher"),
           claims["team"] == .string(request.teamId), case let .string(held)? = claims["inc"],
           request.incidentId == nil || request.incidentId == held {
            membership = (held, request.teamId)
            let message = await loadMission(incidentId: held, teamId: request.teamId)
            if check == accessCheck { joinMessage = message }
            return
        }
        let result = await Joiner(backend: joinBackend).join(request)
        guard check == accessCheck else { return }
        switch result {
        case let .failed(message): joinMessage = message
        case let .joined(incidentId, teamId):
            membership = (incidentId, teamId)
            let message = await loadMission(incidentId: incidentId, teamId: teamId)
            if check == accessCheck { joinMessage = message }
        }
    }

    /// Reads the mission again for the incident the phone is already in; the code is not sent again.
    /// The claims are checked first: a role command took away reads nothing and drops the membership.
    func retryMission() async {
        guard membership != nil else { return }
        accessCheck += 1
        let check = accessCheck
        let claims = await latestClaims()
        // A newer check (or a drop) came first: this one has no say.
        guard check == accessCheck, membership != nil else { return }
        guard let claims else { joinMessage = Self.missionUnread; return }
        guard let held = Self.searcherTeam(claims) else {
            await dropMission()
            joinMessage = Self.notOnATeam
            return
        }
        membership = held
        let message = await loadMission(incidentId: held.incidentId, teamId: held.teamId)
        if check == accessCheck { joinMessage = message }
    }

    /// True when a user is signed in and any loaded mission was read for that same user.
    private var heldByThisUser: Bool {
        guard let user = uid() else { return false }
        return mission.map { $0.ownerUid == user } ?? true
    }

    /// The claims read fresh from the server, or the cached ones with no signal; nil with no token.
    private func latestClaims() async -> [String: JSONValue]? {
        if let fresh = await joinBackend.currentClaims(forceRefresh: true) { return fresh }
        return await joinBackend.currentClaims(forceRefresh: false)
    }

    /// The incident and team the claims grant a searcher; nil for any other role.
    private static func searcherTeam(_ claims: [String: JSONValue]) -> (incidentId: String, teamId: String)? {
        guard claims["role"] == .string("searcher"), case let .string(incidentId)? = claims["inc"],
              case let .string(teamId)? = claims["team"] else { return nil }
        return (incidentId, teamId)
    }

    /// Reads the team's mission and loads it; says why not, or nil when it loaded.
    @discardableResult
    func loadMission(incidentId: String, teamId: String) async -> String? {
        missionGeneration += 1
        let generation = missionGeneration
        do {
            let docs = try await missionReader.read(incidentId: incidentId)
            var mission = try MissionBuilder.build(incidentId: incidentId, teamId: teamId, docs: docs,
                                                   bundledParams: try BundledConstants.engineParams())
            mission.ownerUid = uid()
            // A newer join or load started while this one read: it has the say.
            guard generation == missionGeneration else { return nil }
            // The listener applied a newer plan while this read ran: that plan stays, also when it
            // took the task away, in the same version order the listener keeps.
            if let held = self.mission, held.incidentId == incidentId, held.teamId == teamId,
               (held.planVersion ?? Int.min) > (mission.planVersion ?? Int.min) {
                mission.planVersion = held.planVersion
                mission.assignment = held.assignment
                mission.assignedSegmentIds = held.assignedSegmentIds
            }
            await load(mission)
            // Loading speaks, which takes time: a newer join, load or drop meanwhile owns the listener.
            guard generation == missionGeneration else { return nil }
            watchPlans(incidentId: incidentId, teamId: teamId)
            followTopicSoon()
            await refreshAlerts()
            return nil
        } catch let failure as MissionBuilder.Failure {
            return failure.message
        } catch {
            return Self.missionUnread
        }
    }

    /// The token no longer names this phone's mission: it stops listening and loads nothing.
    private func dropMission() async {
        missionGeneration += 1
        membership = nil
        stopPlanWatch?()
        stopPlanWatch = nil
        planWatchId += 1
        mission = nil
        offersAlerts = false
        // Nothing of the dropped mission is spoken from here on, and the next one starts fresh.
        speaker.stop()
        refreshGate()
        followTopicSoon()
    }

    /// With a mission loaded: alerts already allowed only register; not yet asked shows the one-time
    /// question; refused stays quiet. A status read that finishes after the mission was dropped or
    /// replaced changes nothing.
    private func refreshAlerts() async {
        guard mission != nil else { offersAlerts = false; return }
        let generation = missionGeneration
        let status = await alerts.current()
        guard generation == missionGeneration, mission != nil else { return }
        switch status {
        case .allowed:
            offersAlerts = false
            await alerts.registerForPushes()
        case .refused:
            offersAlerts = false
        case .notAsked:
            offersAlerts = !defaults.bool(forKey: Self.alertsAskedKey)
        }
    }

    /// A tapped new-assignment push. Every tap is checked against the server, also when the push
    /// names the loaded mission: the claims are read fresh, and they must name the push's incident
    /// and team; then the incident and plan are read again, and only then the task screen opens. A
    /// push for another team (an old push) or after the role was taken away opens nothing, and the
    /// mission follows the claims. With no signal, the mission already on this phone is the offline
    /// path: the task opens for a push that names it.
    func openedPush(_ payload: PushPayload) async {
        let matchesLoaded = { [weak self] in
            self?.mission?.incidentId == payload.incidentId && self?.mission?.teamId == payload.teamId
        }
        accessCheck += 1
        let check = accessCheck
        let fresh = await joinBackend.currentClaims(forceRefresh: true)
        guard check == accessCheck else { return }
        guard let fresh else {
            // Auth could not confirm access. With no user, or a mission read for another user, what
            // the phone holds is not this user's: it goes and nothing opens. The same user with no
            // signal: the mission on this phone is the offline path.
            guard heldByThisUser else {
                if mission != nil || membership != nil { await dropMission() }
                return
            }
            if matchesLoaded() { openTaskRequests += 1 }
            return
        }
        guard let (incidentId, teamId) = Self.searcherTeam(fresh) else {
            await dropMission()
            return
        }
        guard incidentId == payload.incidentId, teamId == payload.teamId else {
            // An old push: the claims name another team, which the mission follows; nothing opens.
            await resumeMission()
            return
        }
        if mission != nil, !matchesLoaded() { await dropMission() }
        membership = (incidentId, teamId)
        let message = await loadMission(incidentId: incidentId, teamId: teamId)
        guard check == accessCheck else { return }
        joinMessage = message
        if message == nil, matchesLoaded() { openTaskRequests += 1 }
    }

    /// The searcher's answer to the alerts question; asked once, whatever the answer. With no
    /// question on screen (the mission was dropped), it asks the system nothing.
    func answerAlerts(_ allow: Bool) async {
        guard offersAlerts, mission != nil else { offersAlerts = false; return }
        defaults.set(true, forKey: Self.alertsAskedKey)
        offersAlerts = false
        if allow, await alerts.request() { await alerts.registerForPushes() }
    }

    /// Messaging has its token: a subscription it refused before can go through now.
    func pushTokenArrived() { followTopicSoon() }

    /// Starts following the topic after any change still in flight, so changes keep their order.
    private func followTopicSoon() {
        let previous = topicFollow
        topicFollow = Task { [weak self] in
            await previous?.value
            await self?.followTopic()
        }
    }

    /// The topic the loaded mission's team gets pushes on; nil with no mission.
    private var wantedTopic: String? { mission.flatMap { PushTopic.name(incidentId: $0.incidentId, teamId: $0.teamId) } }

    /// Every topic this phone may still be subscribed to: a topic is listed before its subscription
    /// is tried and stays listed until FCM confirms it was left. Kept across launches, because FCM
    /// keeps subscriptions across them.
    private var heldTopics: Set<String> {
        get { Set(defaults.stringArray(forKey: Self.topicsKey) ?? []) }
        set { defaults.set(newValue.sorted(), forKey: Self.topicsKey) }
    }

    /// Follows the loaded mission's team topic: leaves every other topic the phone may hold (with no
    /// mission, all of them), then subscribes to the wanted one. A leave or a subscription that
    /// fails is tried again at the next sign-in or token arrival. The wanted topic is read again
    /// after each network call, so a team change made meanwhile always wins.
    private func followTopic() async {
        var settled: String?
        repeat {
            let want = wantedTopic
            for old in heldTopics.sorted() where old != want {
                guard (try? await pushTopics.unsubscribe(old)) != nil else { continue }
                heldTopics.remove(old)
                if subscribedTopic == old { subscribedTopic = nil }
            }
            if let want, wantedTopic == want, subscribedTopic != want {
                heldTopics.insert(want)
                do {
                    try await pushTopics.subscribe(want)
                    subscribedTopic = want
                } catch {
                    return
                }
            }
            settled = want
        } while wantedTopic != settled
    }

    /// Listens for plans command approves after the mission loaded, so a new assignment reaches
    /// this phone (and is spoken once) without a new join.
    private func watchPlans(incidentId: String, teamId: String) {
        stopPlanWatch?()
        planWatchId += 1
        let id = planWatchId
        stopPlanWatch = missionReader.watchLatestPlan(incidentId: incidentId) { [weak self] plan in
            Task {
                guard let self, self.planWatchId == id else { return }
                await self.planArrived(plan, incidentId: incidentId, teamId: teamId)
            }
        }
    }

    /// A plan for the loaded mission: the team's assignment and segments follow it. Only a plan newer
    /// than the loaded one counts, so a cache snapshot or an update handled out of order never
    /// replaces a newer assignment or speaks an old one.
    func planArrived(_ planDoc: JSONValue, incidentId: String, teamId: String) async {
        guard var mission, mission.incidentId == incidentId, mission.teamId == teamId,
              let plan = try? planDoc.decode(PlanDoc.self), plan.version > (mission.planVersion ?? Int.min) else { return }
        mission.planVersion = plan.version
        let assignment = plan.assignment(for: teamId)
        guard assignment != mission.assignment else {
            // Newer, with the same task for this team: remember the version, say nothing.
            self.mission = mission
            return
        }
        mission.assignment = assignment
        mission.assignedSegmentIds = assignment?.segmentIds ?? []
        await load(mission)
    }

    /// After every sign-in (at launch, and when signal returns) the mission follows the token's
    /// claims, read fresh from the server: a searcher who joined before gets it back, a team
    /// command changed gets the new team's mission, and claims that no longer name a searcher's
    /// incident drop it. With no signal the cached token answers; with no token, nothing changes.
    private func resumeMission() async {
        accessCheck += 1
        let check = accessCheck
        let latest = await latestClaims()
        // A newer check came first: this one's claims may be older, so it changes nothing.
        guard check == accessCheck, let claims = latest else { return }
        // Not a searcher any more: drop whatever is held, a loaded mission or only a membership
        // whose mission never loaded (and any load still running).
        guard let (incidentId, teamId) = Self.searcherTeam(claims) else {
            await dropMission()
            return
        }
        if mission?.incidentId == incidentId, mission?.teamId == teamId {
            membership = (incidentId, teamId)
            followTopicSoon()
            // The claims are unchanged, but command may have closed the incident: when its status
            // can be read and is no longer open, the mission goes. With no signal it stays.
            let generation = missionGeneration
            guard let status = try? await missionReader.incidentStatus(incidentId: incidentId),
                  check == accessCheck, generation == missionGeneration, status != "open" else { return }
            await dropMission()
            joinMessage = MissionBuilder.Failure.notOpen.message
            return
        }
        // Another incident or team now: the old mission, its plan listener and its spoken updates
        // stop before the new one is read, so a failed read leaves nothing of the old team, and
        // the membership kept below offers reading the new team's mission again.
        if mission != nil { await dropMission() }
        membership = (incidentId, teamId)
        let before = missionGeneration
        let message = await loadMission(incidentId: incidentId, teamId: teamId)
        // Superseded by a join or a newer check meanwhile: their words stay.
        if missionGeneration == before + 1, check == accessCheck { joinMessage = message }
    }

    /// Back in the foreground: the same checks, in case the reconnect happened while suspended. With
    /// signal it settles waiting reports and checks this phone's access again, so a role or team
    /// command changed (or an incident it closed) while the app was away is followed at once.
    func becameActive() {
        guard connectivity.isOnline else { return }
        store?.reconcileUnresolved()
        foregroundCheck = Task { [weak self] in await self?.trySignIn() }
    }

    func retry(_ eventId: String) {
        if store?.retry(eventId) == .offline { problem = "No signal. Retry when you are back in signal." }
    }

    /// Loads a pack, then speaks the team's approved assignment if it is new (eyes stay on the ground).
    /// The voice runs after any voice still speaking, and loading does not wait for it. The line is
    /// spoken only while it is still this mission's assignment, checked when its turn comes, before
    /// any sound and before the phone's own voice stands in: a drop, a newer load or a newer plan
    /// meanwhile keeps it silent.
    func load(_ mission: Mission) async {
        let newIncident = self.mission?.incidentId != mission.incidentId
        let newTeam = self.mission != nil && (newIncident || self.mission?.teamId != mission.teamId)
        // Another incident or team: whatever the old one was saying stops, and its lines are forgotten.
        if newTeam { speaker.stop() }
        self.mission = mission
        refreshGate()
        if newIncident { store?.listen(incidentId: mission.incidentId) }
        let previous = speech, assignment = mission.assignment, template = config.voiceTemplateId
        let generation = missionGeneration, incidentId = mission.incidentId, teamId = mission.teamId
        let online = connectivity.isOnline, killCloud = config.killCloud, signedIn = signIn.signedIn
        let isCurrent: @MainActor () -> Bool = { [weak self] in
            guard let self, let current = self.mission else { return false }
            return self.missionGeneration == generation && current.incidentId == incidentId
                && current.teamId == teamId && current.assignment == assignment
        }
        speech = Task { [weak self] in
            await previous?.value
            guard let self, isCurrent() else { return }
            await self.speaker.update(assignment, voiceTemplate: template, online: online,
                                      killCloud: killCloud, signedIn: signedIn, isCurrent: isCurrent)
        }
    }

    func refreshGate() {
        let online = connectivity.isOnline, consent = cloudConsent, kill = config.killCloud, mode = mission?.mode
        gate.update { $0 = LiveGate(networkOnline: online, cloudConsent: consent, killCloud: kill, incidentMode: mode) }
    }

    /// Sends a report and returns the text to leave in the field: empty once the report is
    /// journaled on this phone, the same words when it was not, so nothing the searcher said is lost.
    func submit(_ text: String, inputMethod: InputMethod) async -> String {
        guard !sending else { return text }
        return await send(text, inputMethod: inputMethod) ? "" : text
    }

    /// Reads the report, builds the one event and journals it. The Firestore write is never
    /// awaited. Returns true once the event is in the journal.
    private func send(_ text: String, inputMethod: InputMethod) async -> Bool {
        guard let mission, let screen, let identity, let store else { problem = "No pack loaded."; return false }
        await trySignIn()
        guard let uid = self.uid() else { problem = "Not signed in yet. Stay in signal for a moment."; return false }
        sending = true
        defer { sending = false }
        refreshGate()
        let submittedAt = nowMs()

        let position = await location.fix(timeout: 10)
        if let position { lastFix = position }
        let situation = ReportSituation(
            incidentMode: mission.mode, knownSegmentIds: mission.grid.map(\.segmentId),
            assignedSegmentIds: mission.assignedSegmentIds,
            positionSegmentId: position.flatMap { Geo.segment(containing: $0, in: mission.grid) },
            profile: mission.profile, networkOnline: connectivity.isOnline, cloudConsent: cloudConsent,
            liveGate: { [gate] in gate.current })
        let outcome = await readReport(text, situation, config, screen)
        let readDone = nowMs()
        switch outcome.cloudTransport {
        case .failed: connectivity.requestFailed()
        case .succeeded: connectivity.requestSucceeded()
        case .notUsed: break
        }

        return journal(outcome, rawText: text, inputMethod: inputMethod, position: position, mission: mission, uid: uid,
                       identity: identity, store: store, submittedAt: submittedAt, readDone: readDone)
    }

    /// A report the searcher picked from the list: no model runs, the person's choices stand.
    func submitPick(_ choice: PickListChoice) async -> Bool {
        guard !sending else { return false }
        guard let mission, let identity, let store else { problem = "No pack loaded."; return false }
        await trySignIn()
        guard let uid = self.uid() else { problem = "Not signed in yet. Stay in signal for a moment."; return false }
        sending = true
        defer { sending = false }
        let submittedAt = nowMs()
        let position = await location.fix(timeout: 10)
        if let position { lastFix = position }
        return journal(PickList.outcome(choice, nowMs: submittedAt), rawText: "", inputMethod: .picklist, position: position,
                       mission: mission, uid: uid, identity: identity, store: store, submittedAt: submittedAt, readDone: submittedAt)
    }

    /// Builds the one event, journals it (the Firestore write is never awaited), recomputes the
    /// posterior and writes the timings. True once the event is in the journal.
    private func journal(_ outcome: ReadOutcome, rawText: String, inputMethod: InputMethod, position: Position?,
                         mission: Mission, uid: String, identity: DeviceIdentity, store: EventStore,
                         submittedAt: Double, readDone: Double) -> Bool {
        do {
            let context = OutcomeContext(
                incidentId: mission.incidentId, teamId: mission.teamId, deviceId: uid, authorUid: uid,
                priorVersion: mission.priorVersion, clientTimeMs: submittedAt,
                inputMethod: inputMethod, isTrainingInject: false, grid: mission.grid,
                effect: EffectContext(grid: mission.grid, assignedSegmentIds: mission.assignedSegmentIds, position: nil,
                                      visualDetectionRangeM: mission.visualDetectionRangeM, rdBasis: mission.rdBasis),
                params: mission.params)
            let event = ReadOutcomeBuilder.event(from: outcome, rawText: rawText, position: position, context: context,
                                                 seq: try identity.nextSeq())
            try store.append(event)
            problem = nil
            recomputePosterior(mission)
            let measurement = ReadMeasurement(submittedAtMs: submittedAt, readDoneAtMs: readDone, redrawnAtMs: nowMs())
            (measurements ?? FirestoreMeasurementWriter()).write(
                measurement, path: ReadMeasurement.path(incidentId: mission.incidentId, teamId: mission.teamId, deviceId: uid,
                                                        eventId: event.eventId))
            return true
        } catch {
            problem = "The report was not saved on this phone. Try again."
            return false
        }
    }

    /// The posterior from the pack's prior and this phone's journal (events already in the prior
    /// are left out by the shared filter).
    private func recomputePosterior(_ mission: Mission) {
        // Every member's events from the listener plus this phone's journal, once each.
        var byId: [String: EventDoc] = [:]
        for doc in (store?.teamEvents ?? []) + missionEntries.map(\.doc) where doc.incidentId == mission.incidentId { byId[doc.eventId] = doc }
        let docs = Array(byId.values)
        posterior = Posterior.compute(prior: mission.prior,
                                      events: EventFilter.toEngineEvents(docs, priorInputEventIds: mission.priorInputEventIds),
                                      params: mission.params)
    }
}
