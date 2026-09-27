package com.aura.player

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import java.lang.ref.WeakReference

class MainActivity : TauriActivity() {

  companion object {
    private var instanceRef: WeakReference<MainActivity>? = null

    fun dispatchMediaAction(action: String, value: Double = 0.0) {
      instanceRef?.get()?.let { activity ->
        activity.runOnUiThread {
          activity.webView?.evaluateJavascript(
            "if (typeof window.__AURA_ON_MEDIA_ACTION__ === 'function') { window.__AURA_ON_MEDIA_ACTION__('$action', $value); }",
            null
          )
        }
      }
    }
  }

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    instanceRef = WeakReference(this)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView

    // Allow autoplay and background playback
    webView.settings.mediaPlaybackRequiresUserGesture = false

    // Attach native bridge for Android Notification and Background Service
    webView.addJavascriptInterface(AuraAndroidBridge(this), "AuraAndroidBridge")
  }

  override fun onPause() {
    super.onPause()
    // By default, WryActivity.onPause calls mWebView.onPause(), which pauses audio playback in WebView!
    // Calling webView.onResume() immediately here keeps HTML5 audio playing continuously in the background!
    webView?.onResume()
  }

  override fun onDestroy() {
    if (instanceRef?.get() == this) {
      instanceRef = null
    }
    super.onDestroy()
  }
}
