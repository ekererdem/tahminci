package com.erdem.tahminci

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Tahminci: arayüz ve simülasyon assets/index.html içinde (JavaScript).
 * Bu sınıf sadece köprü: internetten veri indirme, Bilyoner sayfasını gizli bir tarayıcıda açıp okuma, güncelleme.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView          // uygulama arayüzü
    private lateinit var bil: WebView          // Bilyoner sayfası (arkada çalışır, istenince görünür)
    private lateinit var bilBar: LinearLayout
    private var bilVisible = false

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("#0B1118")
        window.navigationBarColor = Color.parseColor("#0E161F")

        val root = FrameLayout(this)
        val mp = ViewGroup.LayoutParams.MATCH_PARENT

        // Bilyoner tarayıcısı: en altta, ekranda ama arayüzün arkasında (canlı güncellemeler çalışmaya devam etsin)
        val bilWrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor("#0B1118")) }
        bilBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(Color.parseColor("#131C26")); gravity = Gravity.CENTER_VERTICAL
            setPadding(24, 18, 24, 18)
            addView(TextView(context).apply { text = "Bilyoner sayfası"; setTextColor(Color.WHITE); textSize = 15f },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply {
                text = "← Tahminci'ye dön"; setTextColor(Color.parseColor("#F5B83D")); textSize = 15f
                setPadding(16, 8, 0, 8); setOnClickListener { showBilyoner(false) }
            })
        }
        bil = WebView(this)
        bilWrap.addView(bilBar, LinearLayout.LayoutParams(mp, ViewGroup.LayoutParams.WRAP_CONTENT))
        bilWrap.addView(bil, LinearLayout.LayoutParams(mp, 0, 1f))
        root.addView(bilWrap, FrameLayout.LayoutParams(mp, mp))

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0B1118"))
        root.addView(web, FrameLayout.LayoutParams(mp, mp))
        setContentView(root)

        bil.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true; databaseEnabled = true
            userAgentString = userAgentString.replace("; wv", "")   // normal Chrome gibi görünsün
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        bil.webViewClient = WebViewClient()
        bil.webChromeClient = WebChromeClient()

        web.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = true
        }
        web.webViewClient = WebViewClient()
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(), "Android")
        web.loadUrl("file:///android_asset/index.html")

        handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /** Bilyoner uygulamasından/tarayıcıdan "Paylaş" ile gelen link */
    private fun handleShare(i: Intent?) {
        if (i?.action != Intent.ACTION_SEND) return
        val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: return
        val url = Regex("""https?://\S*bilyoner\.com\S*""").find(t)?.value ?: return
        web.postDelayed({ js("window.onSharedUrl && window.onSharedUrl(${JSONObject.quote(url)})") }, 1200)
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }
    private fun cb(id: Int, data: String?) = js("window.__cb($id, ${if (data == null) "null" else JSONObject.quote(data)})")

    private fun showBilyoner(show: Boolean) = runOnUiThread {
        bilVisible = show
        web.visibility = if (show) View.GONE else View.VISIBLE
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            bilVisible && bil.canGoBack() -> bil.goBack()
            bilVisible -> showBilyoner(false)
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun fetch(url: String, id: Int) {
            Thread {
                var out: String? = null
                try {
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.instanceFollowRedirects = true
                    c.connectTimeout = 15000; c.readTimeout = 30000
                    c.setRequestProperty("User-Agent", "Tahminci")
                    if (c.responseCode == 200) out = c.inputStream.bufferedReader().use { it.readText() }
                } catch (e: Exception) {}
                cb(id, out)
            }.start()
        }

        @JavascriptInterface
        fun readAsset(name: String): String? = try {
            assets.open(name).bufferedReader().use { it.readText() }
        } catch (e: Exception) { null }

        @JavascriptInterface
        fun bilyonerLoad(url: String) = runOnUiThread { bil.loadUrl(url) }

        @JavascriptInterface
        fun bilyonerShow(show: Boolean) = showBilyoner(show)

        /** Bilyoner sayfasının görünen metnini döndürür (oranlar + maç bilgisi) */
        @JavascriptInterface
        fun bilyonerRead(id: Int) = runOnUiThread {
            bil.evaluateJavascript("(function(){return document.body ? document.body.innerText : ''})()") { r ->
                // r zaten JSON metni ("...") ya da null
                js("window.__cb($id, ${if (r == null || r == "null") "null" else r})")
            }
        }

        /** Bilyoner sayfasında kod çalıştırıp sonucu (metin) döndürür: maç arama için */
        @JavascriptInterface
        fun bilyonerEval(code: String, id: Int) = runOnUiThread {
            bil.evaluateJavascript(code) { r -> js("window.__cb($id, ${if (r == null) "null" else r})") }
        }

        @JavascriptInterface
        fun bilyonerUrl(id: Int) = runOnUiThread { cb(id, bil.url) }

        @JavascriptInterface
        fun appVersion(): String = "${Update.currentName(this@MainActivity)} (${Update.current(this@MainActivity)})"

        @JavascriptInterface
        fun checkUpdate(id: Int) = runOnUiThread {
            Update.check(this@MainActivity) { name, code, err ->
                cb(id, when {
                    err != null -> null
                    name != null && code > Update.current(this@MainActivity) -> "$name ($code)"
                    else -> "none"
                })
            }
        }

        @JavascriptInterface
        fun installUpdate() = runOnUiThread {
            Update.install(this@MainActivity) { p -> js("window.onUpdateProgress && window.onUpdateProgress($p)") }
        }

        @JavascriptInterface
        fun toast(msg: String) = runOnUiThread { Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show() }

        @JavascriptInterface
        fun clipboard(): String {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            return cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() ?: ""
        }

        @JavascriptInterface
        fun copy(text: String) {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Tahminci", text))
        }
    }
}
