# Shows a Windows toast. Text comes from the environment (BE_TOAST_TITLE, BE_TOAST_BODY,
# BE_TOAST_URL), never from the command line; see windows-toast.ts.
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

function Esc([string]$s) { [System.Security.SecurityElement]::Escape($s) }

$launch = ''
if ($env:BE_TOAST_URL) { $launch = ' activationType="protocol" launch="' + (Esc $env:BE_TOAST_URL) + '"' }
$xml = '<toast' + $launch + '><visual><binding template="ToastGeneric"><text>' + (Esc $env:BE_TOAST_TITLE) +
  '</text><text>' + (Esc $env:BE_TOAST_BODY) + '</text></binding></visual></toast>'

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
# Windows PowerShell's own app id: a toast needs a registered sender.
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
