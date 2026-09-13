# Mobile delivery boundary

Android and iOS daily workflows remain a required milestone. Native projects are intentionally not generated in the initial web/API foundation: the hospital's distribution/signing approach and local patient-data policy are unresolved.

Build using React Native, consuming `@oncotrack/contracts` and the versioned API. Do not import web DOM components or store credentials in plain application storage. Select and lock a compatible React Native toolchain during the mobile spike; validate both OS builds on physical devices.

Required screens: login, role queue, RT chart status, permitted task submission/review, rejection reason, notifications and pending-sync actions. A client-side queue is never authority to approve a transition. The server rechecks session, role, assignment, prerequisites and expected chart version on reconnect.

Before offline implementation, decide permitted cached fields, encryption, expiry, sign-out clearing and lost-device handling. Before push implementation, approve relay payload/network boundaries. No native app or offline synchronization is implemented by this README.
