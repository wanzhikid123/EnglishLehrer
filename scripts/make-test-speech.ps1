Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$german = $voice.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'de-DE' } | Select-Object -First 1
if (-not $german) { throw 'A German Windows speech voice is required for this optional test.' }
$voice.SelectVoice($german.VoiceInfo.Name)
$voice.Rate = -2
$folder = Join-Path $PSScriptRoot '../.cache/test-speech'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$phrases = @{
  'question' = 'Hallo Mia. Ich moechte bitte ein Farbenspiel mit roten und blauen Baellen machen. Bitte stelle mir eine Auswahlfrage.'
  'red' = 'Rot.'
  'blue' = 'Blau.'
  'yellow' = 'Gelb.'
  'green' = 'Gruen.'
  'hint' = 'Kannst du mir bitte einen Tipp geben?'
  'monday' = 'Monday.'
}
foreach ($name in $phrases.Keys) {
  $voice.SetOutputToWaveFile((Join-Path $folder "$name.wav"))
  $voice.Speak($phrases[$name])
  $voice.SetOutputToNull()
}
$voice.Dispose()
Write-Output 'Synthetic German test audio created. No microphone recording used.'
