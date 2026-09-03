# TrustFord Broker Stock — Android shell

A deliberately minimal WebView wrapper around `https://tfleasing-app.vercel.app/broker/stock`.

## Why this exists

`FLAG_SECURE`. On Android that one flag makes the window unreadable to the
screenshot pipeline and to screen recorders: the OS refuses the capture, the
recording comes out black, and the app-switcher thumbnail is blank. **It is
the only genuine prevention anywhere in this project.** Everything on the web
side — watermark, shield, print blocking, alerts — is deterrence and
traceability, because a browser has no equivalent API.

Two things follow from that, and both matter:

- **It has to be a WebView, not a Trusted Web Activity.** A TWA renders the
  page inside Chrome's own window, in Chrome's process. `FLAG_SECURE` on our
  activity would protect nothing. Here the activity owns the rendering, so
  the flag covers the content.
- **There is no iOS version and there cannot be.** Apple exposes no
  equivalent. iPhone users get the web portal, with the watermark.

If you ever remove `window.setFlags(FLAG_SECURE, …)` from `MainActivity`,
this app has no reason to exist — it becomes a worse browser.

## Building

Needs a JDK 17 and the Android SDK (Android Studio installs both). Neither is
on the machine this was written on, so **it has not been compiled** — expect
to fix a version pin or two on first build.

**Open the `android/` folder in Android Studio** — it will generate the
Gradle wrapper, fetch the SDK pieces and build. There is no `gradlew` checked
in because generating one needs Gradle installed, which this machine does not
have.

From the command line, once you have Gradle:

```bash
cd android
gradle wrapper            # once, to create ./gradlew
./gradlew assembleRelease
```

The APK lands in `app/build/outputs/apk/release/`.

**Signing:** `app/build.gradle.kts` currently signs release with the debug
key so an APK builds without setup. That is fine for sideloading and wrong
for anything else — before you distribute widely, generate a real keystore
and point `signingConfig` at it, or every update will fail to install over
the last one.

## Getting it onto broker phones

A pure WebView wrapper can fall foul of Google Play's "minimum functionality"
policy for a public listing, so plan for one of:

1. **Direct APK** — host the file, brokers enable "install unknown apps"
   once. Simplest, no review, no store. Fine for a known list of partners.
2. **Play Console → internal testing / closed testing** — up to 100 testers
   by email, no public listing, no policy review of the kind a public
   listing gets.
3. **Managed Google Play** — the right answer if brokers' phones are ever
   MDM-managed, which they probably are not.

Start with 1 or 2.

## What it deliberately does not do

- No general browsing: anything off `tfleasing-app.vercel.app` opens in the
  real browser rather than inside the secure window, so a stray link cannot
  turn this into an unlocked browser that happens to have `FLAG_SECURE`.
- No file access, no third-party cookies, no multiple windows, no mixed
  content.
- It appends `TFBrokerStock/1.0` to the user agent, so the server can tell
  the hardened client apart from a plain mobile browser.

## What it still cannot stop

Someone photographing the screen with a second phone. Nothing can. That
capture carries the watermark, which is the point of the watermark.
