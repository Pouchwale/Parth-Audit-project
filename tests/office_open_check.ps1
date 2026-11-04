# REQUIREMENTS §183. Opens the files tests/check_all_documents.py downloaded in a NEW Excel / Word instance (never one the person has open), one file at a time, a log line
# per file as it goes. Word files are also saved as PDF (wordpdf\) when -Pdf is given - not on the plant PC, whose Word waits
# on the default printer (the network Canon) to lay out pages.
# Run: powershell -File tests\office_open_check.ps1 -Root <OUT_DIR> -App excel -Log <file>   (then -App word)
param([string]$Root, [ValidateSet('excel','word')][string]$App, [string]$Only = "", [switch]$Pdf, [string]$Log)
$ErrorActionPreference = 'Continue'
function Say($s) { Add-Content -Path $Log -Value $s -Encoding utf8 }
$pdfDir = Join-Path $Root "wordpdf"
New-Item -ItemType Directory -Force $pdfDir | Out-Null

if ($App -eq 'excel') {
  $excel = New-Object -ComObject Excel.Application
  if ($excel.Workbooks.Count -ne 0) { Say "ABORT: the Excel instance already holds workbooks (not a new one)"; exit 2 }
  $excel.Visible = $false; $excel.DisplayAlerts = $false; $excel.AskToUpdateLinks = $false; $excel.ScreenUpdating = $false
  foreach ($f in Get-ChildItem (Join-Path $Root "xlsx") -Filter *.xlsx) {
    if ($Only -and $f.BaseName -notin ($Only -split ',')) { continue }
    try {
      $wb = $excel.Workbooks.Open($f.FullName, 0, $true)
      $caption = $wb.Windows.Item(1).Caption
      $visible = @($wb.Worksheets | Where-Object { $_.Visible -eq -1 })
      $cells = 0; $setup = @()
      foreach ($ws in $visible) {
        $cells += $ws.UsedRange.Cells.Count
        $ps = $ws.PageSetup
        $o = if ($ps.Orientation -eq 2) { 'L' } else { 'P' }
        $fit = if ($ps.Zoom -eq $false) { "fit $($ps.FitToPagesWide)x$($ps.FitToPagesTall)" } else { "zoom $($ps.Zoom)" }
        $setup += "$($ws.Name)[$o $fit]"
      }
      $ok = ($visible.Count -ge 1 -and $cells -gt 3 -and $caption -notmatch 'Repaired')
      Say ("[{0}] Excel {1} | caption: {2}; cells: {3}; {4}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $f.Name, $caption, $cells, ($setup -join '; '))
      $wb.Close($false)
    } catch { Say "[FAIL] Excel $($f.Name) | OPEN FAILED: $($_.Exception.Message)" }
  }
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  Say "DONE excel"
}

if ($App -eq 'word') {
  $word = New-Object -ComObject Word.Application
  if ($word.Documents.Count -ne 0) { Say "ABORT: the Word instance already holds documents (not a new one)"; exit 2 }
  $word.Visible = $false; $word.DisplayAlerts = 0
  try { $word.Options.CheckGrammarAsYouType = $false; $word.Options.CheckSpellingAsYouType = $false } catch {}
  foreach ($f in Get-ChildItem (Join-Path $Root "docx") -Filter *.docx) {
    if ($Only -and $f.BaseName -notin ($Only -split ',')) { continue }
    Say "... Word $($f.Name)"
    try {
      $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
      $chars = $doc.Characters.Count
      $tables = $doc.Tables.Count
      $pages = if ($Pdf) { $doc.ComputeStatistics(2) } else { 'not laid out' }
      $orient = @(); foreach ($s in $doc.Sections) { $orient += $(if ($s.PageSetup.Orientation -eq 1) { 'L' } else { 'P' }) }
      if ($Pdf) { $doc.ExportAsFixedFormat((Join-Path $pdfDir ($f.BaseName + ".pdf")), 17) }
      $ok = ($chars -gt 50)
      Say ("[{0}] Word {1} | characters: {2}; tables: {3}; pages: {4}; sections: {5}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $f.Name, $chars, $tables, $pages, ($orient -join ''))
      $doc.Close(0)
    } catch { Say "[FAIL] Word $($f.Name) | OPEN FAILED: $($_.Exception.Message)" }
  }
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  Say "DONE word"
}
