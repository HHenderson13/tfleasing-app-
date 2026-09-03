package uk.co.trustford.brokerstock

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * A deliberately minimal shell around the TrustFord broker portal.
 *
 * It exists for ONE reason: FLAG_SECURE. On Android that flag makes the
 * window unreadable to the screenshot pipeline and to screen recorders —
 * the OS refuses the capture, and a recording of this app is a black
 * rectangle. It is the only genuine *prevention* available anywhere in this
 * project; everything on the web side is deterrence and traceability
 * because a browser has no equivalent.
 *
 * It has to be a WebView, not a Trusted Web Activity. A TWA renders the
 * page inside Chrome's own window, in Chrome's process, so FLAG_SECURE on
 * our activity would protect nothing. Here the activity owns the rendering,
 * so the flag covers the content.
 *
 * iOS has no equivalent API, so there is no iOS counterpart to this and
 * there cannot be one.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // FIRST, before any content exists to capture. This blocks
        // screenshots, screen recording, and the thumbnail Android puts in
        // the app switcher. Removing this line removes the entire point of
        // the app.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        webView = WebView(this)
        setContentView(webView)
        configureWebView()

        if (savedInstanceState == null) webView.loadUrl(PORTAL_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true          // the portal is a React app
            domStorageEnabled = true          // and it uses DOM storage
            loadWithOverviewMode = true
            useWideViewPort = true
            // Never let the shell become a general-purpose browser.
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            // Marks requests as coming from the hardened client, so the
            // server side can tell this apart from a plain mobile browser
            // when someone asks how a broker was viewing stock.
            userAgentString = "$userAgentString TFBrokerStock/1.0"
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        // Session cookie has to survive app restarts or brokers re-login
        // every launch. It is Path-scoped to /broker by the server.
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                // Anything off our own host opens in the real browser
                // instead. Keeps the secure window showing only the thing it
                // was built to protect, and stops a stray link turning this
                // into an unlocked browser that happens to have FLAG_SECURE.
                return if (url.host?.equals(PORTAL_HOST, ignoreCase = true) == true) {
                    false
                } else {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                    true
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        // Change both together if the portal ever moves.
        const val PORTAL_HOST = "tfleasing-app.vercel.app"
        const val PORTAL_URL = "https://$PORTAL_HOST/broker/stock"
    }
}
