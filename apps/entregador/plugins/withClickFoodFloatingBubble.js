const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const PACKAGE = 'br.com.clickfood.entregador';
const MODULE_PACKAGE = `${PACKAGE}.floatingbubble`;

function addPermission(manifest, name) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  if (!manifest['uses-permission'].some((item) => item?.$?.['android:name'] === name)) {
    manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
}

function withBubbleManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    addPermission(manifest, 'android.permission.SYSTEM_ALERT_WINDOW');
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE');
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE');

    const application = manifest.application?.[0];
    if (!application) throw new Error('Android application node not found');
    application.service = application.service || [];

    const serviceName = '.floatingbubble.FloatingBubbleService';
    if (!application.service.some((item) => item?.$?.['android:name'] === serviceName)) {
      application.service.push({
        $: {
          'android:name': serviceName,
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
          'android:stopWithTask': 'false',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'CLICK-FOOD driver floating shortcut while the driver is online',
            },
          },
        ],
      });
    }
    return config;
  });
}

function withBubbleMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    const importLine = `import ${MODULE_PACKAGE}.ClickFoodFloatingBubblePackage`;
    if (!contents.includes(importLine)) {
      const packageMatch = contents.match(/^package\s+[^\n]+\n/m);
      if (!packageMatch) throw new Error('Could not locate MainApplication package declaration');
      contents = contents.replace(packageMatch[0], `${packageMatch[0]}\n${importLine}\n`);
    }

    if (!contents.includes('add(ClickFoodFloatingBubblePackage())')) {
      const applyRegex = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!applyRegex.test(contents)) throw new Error('Could not locate PackageList(this).packages.apply in MainApplication');
      contents = contents.replace(applyRegex, (match) => `${match}\n          add(ClickFoodFloatingBubblePackage())`);
    }

    config.modResults.contents = contents;
    return config;
  });
}

const moduleSource = `package ${MODULE_PACKAGE}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ClickFoodFloatingBubbleModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ClickFoodFloatingBubble"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context))
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)) {
      promise.resolve(true)
      return
    }
    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
    promise.resolve(false)
  }

  @ReactMethod
  fun start(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
      promise.resolve(false)
      return
    }
    val intent = Intent(context, FloatingBubbleService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ContextCompat.startForegroundService(context, intent)
    else context.startService(intent)
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    context.stopService(Intent(context, FloatingBubbleService::class.java))
    promise.resolve(true)
  }
}
`;

const packageSource = `package ${MODULE_PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ClickFoodFloatingBubblePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(ClickFoodFloatingBubbleModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

const serviceSource = `package ${MODULE_PACKAGE}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class FloatingBubbleService : Service() {
  private var windowManager: WindowManager? = null
  private var bubble: View? = null
  private val channelId = "clickfood-driver-bubble"
  private val notificationId = 9127

  override fun onCreate() {
    super.onCreate()
    startForeground(notificationId, buildNotification())
    showBubble()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (bubble == null) showBubble()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun homeIntent(): Intent {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    launchIntent.data = Uri.parse("clickfood-entregador://home")
    return launchIntent
  }

  private fun buildNotification(): android.app.Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Atalho flutuante do entregador", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Mantém o atalho flutuante do CLICK-FOOD enquanto o entregador está online."
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }
    val pending = PendingIntent.getActivity(
      this,
      41,
      homeIntent(),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, channelId)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("CLICK-FOOD Entregador online")
      .setContentText("Bolinha flutuante ativa • toque para voltar ao app")
      .setContentIntent(pending)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }

  private fun showBubble() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      stopSelf()
      return
    }
    if (bubble != null) return

    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val size = dp(58)
    val circle = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.rgb(244, 196, 0))
      setStroke(dp(3), Color.rgb(17, 17, 17))
    }
    val view = TextView(this).apply {
      text = "CF"
      textSize = 17f
      setTextColor(Color.rgb(17, 17, 17))
      gravity = Gravity.CENTER
      background = circle
      elevation = dp(8).toFloat()
      contentDescription = "Voltar ao CLICK-FOOD Entregador"
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      size,
      size,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(14)
      y = dp(180)
    }

    var downRawX = 0f
    var downRawY = 0f
    var startX = 0
    var startY = 0
    var moved = false

    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          startX = params.x
          startY = params.y
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downRawX).toInt()
          val dy = (event.rawY - downRawY).toInt()
          if (abs(dx) > dp(4) || abs(dy) > dp(4)) moved = true
          val metrics = resources.displayMetrics
          params.x = (startX + dx).coerceIn(0, (metrics.widthPixels - size).coerceAtLeast(0))
          params.y = (startY + dy).coerceIn(0, (metrics.heightPixels - size - dp(36)).coerceAtLeast(0))
          windowManager?.updateViewLayout(view, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            try { startActivity(homeIntent()) } catch (_: Exception) {}
          }
          true
        }
        else -> false
      }
    }

    try {
      windowManager?.addView(view, params)
      bubble = view
    } catch (_: Exception) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    bubble?.let { view ->
      try { windowManager?.removeView(view) } catch (_: Exception) {}
    }
    bubble = null
    windowManager = null
    super.onDestroy()
  }
}
`;

function withBubbleSources(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...MODULE_PACKAGE.split('.'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ClickFoodFloatingBubbleModule.kt'), moduleSource);
    fs.writeFileSync(path.join(dir, 'ClickFoodFloatingBubblePackage.kt'), packageSource);
    fs.writeFileSync(path.join(dir, 'FloatingBubbleService.kt'), serviceSource);
    return config;
  }]);
}

module.exports = function withClickFoodFloatingBubble(config) {
  config = withBubbleManifest(config);
  config = withBubbleMainApplication(config);
  config = withBubbleSources(config);
  return config;
};
