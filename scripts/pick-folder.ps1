# Windows'ta "Klasör Seç" diyaloğu — arka planda çalışan sunucudan spawn edilir.
# Sorun: diyalog varsayılan olarak tarayıcının ARKASINDA açılır (foreground kilidi).
# Çözüm: bir arka plan işi, diyalog penceresini (#32770) bulup HWND_TOPMOST yapar
# ve öne getirir. STDOUT'a yalnızca seçilen yol yazılır (iptalde hiçbir şey).

$fgCode = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DlgFg {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
  delegate bool EnumProc(IntPtr h, IntPtr p);
  static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  public static void Promote() {
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var cn = new StringBuilder(64); GetClassName(h, cn, 64);
      if (cn.ToString() == "#32770") {
        ShowWindow(h, 5);                                  // SW_SHOW
        SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, 0x0003); // NOMOVE|NOSIZE
        SetForegroundWindow(h);
      }
      return true;
    }, IntPtr.Zero);
  }
}
'@

# Diyalog penceresini öne çeken arka plan işi (ayrı process, EnumWindows sistem geneli çalışır).
$job = Start-Job -ArgumentList $fgCode -ScriptBlock {
    param($code)
    Add-Type -TypeDefinition $code
    for ($i = 0; $i -lt 60; $i++) { [DlgFg]::Promote(); Start-Sleep -Milliseconds 150 }
}

# Shell.Application diyaloğu WinForms FolderBrowserDialog'dan daha güvenilir render eder.
# 0x40 = BIF_NEWDIALOGSTYLE (yeni tarz, yeniden boyutlandırılabilir + yeni klasör butonu).
$shell = New-Object -ComObject Shell.Application
$folder = $shell.BrowseForFolder(0, 'Testlerin kaydedilecegi / kosulacagi klasoru secin', 0x40)

Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -Force -ErrorAction SilentlyContinue

if ($folder -and $folder.Self) { Write-Output $folder.Self.Path }
