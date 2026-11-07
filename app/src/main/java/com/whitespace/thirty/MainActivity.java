package com.whitespace.thirty;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * 흰 공간 30일 — 게임 창
 *
 * 게임(HTML · 그림 · 소리)은 APK 안(assets/web)에 들어 있어 인터넷 없이도 실행된다.
 * 실행할 때마다 GitHub 의 whitespace-game 브랜치에 있는 version.json 을 읽어,
 * 바뀐 파일만 내려받아 앱 저장 공간(files/web)에 둔다. 다 받으면 바로 적용할지 묻는다.
 * 게임은 https://appassets.local/ 라는 가짜 주소에서 열린다 (저장 기록 · 소리가 안정적으로 동작하도록).
 *   파일 찾는 순서: files/web/<경로> (업데이트로 받은 것) → assets/web/<경로> (APK 에 든 것)
 * 저장 기록은 이 주소의 브라우저 저장소에 남고, 업데이트해도 지워지지 않는다. (앱을 삭제하면 지워진다)
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.local";
    static final String START = "https://" + HOST + "/index.html";
    static final String REMOTE = "https://raw.githubusercontent.com/subinha693-maker/Deolphone/whitespace-game/site/web/";

    WebView web;
    File liveDir, stageDir;
    final Handler main = new Handler(Looper.getMainLooper());
    volatile boolean checking = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        liveDir = new File(getFilesDir(), "web");
        stageDir = new File(getFilesDir(), "web_stage");
        prepareContent();

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;          // 글꼴 등 바깥 주소는 그대로
                return serve(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost());         // 게임 밖으로 나가는 링크는 열지 않는다
            }
        });
        setContentView(web);
        hideBars();
        if (state != null) web.restoreState(state);
        else web.loadUrl(START);

        checkUpdate(false);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @SuppressWarnings("deprecation")
    void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // 게임 안의 창(메뉴 · 상점 등)을 먼저 닫아 보고, 열린 창이 없으면 종료를 묻는다
        web.evaluateJavascript("(function(){var o=document.querySelector('.overlay.show');if(o){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));var c=o.querySelector('.rm-close');if(c)c.click();return 'closed';}return 'none';})()", r -> {
            if (r != null && r.contains("closed")) return;
            new AlertDialog.Builder(this)
                    .setMessage("게임을 종료할까요?\n(저장하지 않은 진행은 사라집니다)")
                    .setPositiveButton("종료", (d, w) -> finish())
                    .setNegativeButton("계속하기", null)
                    .show();
        });
    }

    // ---------------------------------------------------------------- 파일 제공
    static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("png", "image/png"); MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg"); MIME.put("gif", "image/gif"); MIME.put("svg", "image/svg+xml");
        MIME.put("webp", "image/webp"); MIME.put("mp3", "audio/mpeg"); MIME.put("ogg", "audio/ogg");
        MIME.put("wav", "audio/wav"); MIME.put("woff", "font/woff"); MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf"); MIME.put("txt", "text/plain"); MIME.put("md", "text/plain");
    }

    WebResourceResponse serve(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String rel = Uri.decode(path).replaceFirst("^/+", "");
        if (rel.contains("..")) return notFound();
        String ext = rel.contains(".") ? rel.substring(rel.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in;
            File f = new File(liveDir, rel);
            if (f.isFile()) in = new FileInputStream(f);
            else in = getAssets().open("web/" + rel);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            String enc = mime.startsWith("text/") || mime.equals("application/json") ? "utf-8" : null;
            return new WebResourceResponse(mime, enc, 200, "OK", h, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    // ---------------------------------------------------------------- 업데이트
    /** 실행 전에: 받아 둔 업데이트를 적용하고, APK 에 든 게임이 더 새것이면 받아 둔 것을 지운다 */
    void prepareContent() {
        try {
            if (new File(stageDir, "version.json").isFile()) applyStage();
            JSONObject live = readJson(new File(liveDir, "version.json"));
            JSONObject bundled = readAssetJson("web/version.json");
            if (live != null && bundled != null && bundled.optString("version").compareTo(live.optString("version")) > 0) {
                deleteTree(liveDir);
            }
        } catch (Exception e) {
            deleteTree(stageDir);
        }
    }

    /** 지금 쓰는 게임의 파일 목록 (받아 둔 것이 있으면 그것, 없으면 APK 에 든 것) */
    JSONObject currentManifest() {
        JSONObject live = readJson(new File(liveDir, "version.json"));
        return live != null ? live : readAssetJson("web/version.json");
    }

    void checkUpdate(boolean manual) {
        if (checking) return;
        checking = true;
        new Thread(() -> {
            try {
                JSONObject remote = new JSONObject(new String(download(REMOTE + "version.json?t=" + System.currentTimeMillis()), StandardCharsets.UTF_8));
                JSONObject cur = currentManifest();
                String rv = remote.optString("version"), cv = cur == null ? "" : cur.optString("version");
                if (rv.isEmpty() || rv.compareTo(cv) <= 0) { if (manual) toast("최신 버전입니다. (" + cv + ")"); return; }
                JSONObject rf = remote.getJSONObject("files"), cf = cur == null ? new JSONObject() : cur.optJSONObject("files");
                if (cf == null) cf = new JSONObject();
                deleteTree(stageDir);
                stageDir.mkdirs();
                int n = 0;
                long bytes = 0;
                for (Iterator<String> it = rf.keys(); it.hasNext(); ) {
                    String p = it.next();
                    JSONObject r = rf.getJSONObject(p), c = cf.optJSONObject(p);
                    if (c != null && r.optString("h").equals(c.optString("h"))) continue;
                    byte[] data = download(REMOTE + encodePath(p) + "?v=" + rv);
                    if (!sha256(data).equals(r.optString("h"))) throw new IOException("파일 확인 실패: " + p);
                    File out = new File(stageDir, p);
                    out.getParentFile().mkdirs();
                    try (OutputStream o = new FileOutputStream(out)) { o.write(data); }
                    n++; bytes += data.length;
                }
                // 목록은 마지막에 쓴다 (다 받았다는 표시)
                try (OutputStream o = new FileOutputStream(new File(stageDir, "version.json"))) { o.write(remote.toString().getBytes(StandardCharsets.UTF_8)); }
                final int files = n;
                final long size = bytes;
                final String notes = remote.optString("notes");
                main.post(() -> askApply(rv, files, size, notes));
            } catch (Exception e) {
                deleteTree(stageDir);
                if (manual) toast("업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.");
            } finally {
                checking = false;
            }
        }).start();
    }

    void askApply(String version, int files, long bytes, String notes) {
        if (isFinishing()) return;
        String msg = "새 버전(" + version + ")을 받았습니다." + (notes.isEmpty() ? "" : "\n\n" + notes)
                + "\n\n지금 적용하면 게임을 다시 불러옵니다. 저장하지 않은 진행은 사라지니, 먼저 저장해 두세요.";
        new AlertDialog.Builder(this)
                .setTitle("업데이트")
                .setMessage(msg)
                .setPositiveButton("지금 적용", (d, w) -> {
                    try { applyStage(); } catch (Exception e) { toast("업데이트를 적용하지 못했습니다."); return; }
                    web.loadUrl(START);
                    toast("업데이트했습니다. (" + version + ")");
                })
                .setNegativeButton("다음에 켤 때", (d, w) -> toast("다음에 앱을 켤 때 적용됩니다."))
                .show();
    }

    /** 받아 둔 파일을 실제 위치로 옮기고, 새 목록에 없는 파일은 지운다 */
    synchronized void applyStage() throws Exception {
        JSONObject m = readJson(new File(stageDir, "version.json"));
        if (m == null) { deleteTree(stageDir); return; }
        liveDir.mkdirs();
        moveTree(stageDir, liveDir, stageDir);
        JSONObject files = m.getJSONObject("files");
        pruneTree(liveDir, liveDir, files);
        try (OutputStream o = new FileOutputStream(new File(liveDir, "version.json"))) { o.write(m.toString().getBytes(StandardCharsets.UTF_8)); }
        deleteTree(stageDir);
    }

    void moveTree(File dir, File dest, File root) throws IOException {
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            String rel = root.toURI().relativize(f.toURI()).getPath();
            File to = new File(dest, rel);
            if (f.isDirectory()) { to.mkdirs(); moveTree(f, dest, root); continue; }
            if (rel.equals("version.json")) continue;
            to.getParentFile().mkdirs();
            if (to.exists()) to.delete();
            if (!f.renameTo(to)) throw new IOException("옮기기 실패: " + rel);
        }
    }

    void pruneTree(File dir, File root, JSONObject keep) {
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            if (f.isDirectory()) { pruneTree(f, root, keep); continue; }
            String rel = root.toURI().relativize(f.toURI()).getPath();
            if (!rel.equals("version.json") && !keep.has(rel)) f.delete();
        }
    }

    // ---------------------------------------------------------------- 도구
    static byte[] download(String u) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        } finally {
            c.disconnect();
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    static String encodePath(String p) {
        StringBuilder sb = new StringBuilder();
        for (String seg : p.split("/")) { if (sb.length() > 0) sb.append('/'); sb.append(Uri.encode(seg)); }
        return sb.toString();
    }

    static String sha256(byte[] data) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    JSONObject readJson(File f) {
        if (!f.isFile()) return null;
        try (InputStream in = new FileInputStream(f)) { return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)); }
        catch (Exception e) { return null; }
    }

    JSONObject readAssetJson(String path) {
        try (InputStream in = getAssets().open(path)) { return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)); }
        catch (Exception e) { return null; }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] list = f.listFiles();
        if (list != null) for (File c : list) deleteTree(c);
        f.delete();
    }

    void toast(String msg) {
        main.post(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }
}
