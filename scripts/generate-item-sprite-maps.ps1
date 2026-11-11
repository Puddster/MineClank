param(
    [string]$JarPath = (Join-Path $env:APPDATA '.minecraft\versions\26.3\26.3.jar'),
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\item-icons'),
    [string]$MinecraftDataVersion = '26.1',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $JarPath -PathType Leaf)) {
    throw "Minecraft client JAR not found: $JarPath"
}

$spriteMapCategories = @(
    'blocks-overworld', 'blocks-nether', 'blocks-end', 'blocks-other',
    'materials', 'equipment', 'spawn-eggs', 'food', 'transport'
)
$existingOutputs = @($spriteMapCategories | ForEach-Object {
    $path = Join-Path $OutputDirectory "$_-sprites.svg"
    if (Test-Path -LiteralPath $path) { $path }
})
if ($existingOutputs.Count -gt 0 -and -not $Force) {
    throw "Output already exists: $($existingOutputs -join ', '). Use -Force to replace them."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeScript = @"
import minecraftData from 'minecraft-data';
import { getItemCategory } from './server/item-category.js';
const registry = minecraftData('$MinecraftDataVersion');
if (!registry) throw new Error('Unsupported minecraft-data version');
const items = Object.keys(registry.itemsByName).map(name => ({ name, category: getItemCategory({ name }, registry) }));
process.stdout.write(JSON.stringify(items));
"@
Push-Location $projectRoot
try {
    $itemsJson = & node --input-type=module -e $nodeScript
    if ($LASTEXITCODE -ne 0) {
        throw "Could not load items from minecraft-data version $MinecraftDataVersion"
    }
}
finally {
    Pop-Location
}

$items = @($itemsJson | ConvertFrom-Json)
$textureAliases = @{ enchanted_golden_apple = 'golden_apple' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $JarPath).Path)
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$script:archive = $archive
$script:modelCache = @{}
$script:jsonCache = @{}
$script:textureCache = @{}

function Read-ArchiveJson([string]$entryPath) {
    if ($script:jsonCache.ContainsKey($entryPath)) { return $script:jsonCache[$entryPath] }
    $entry = $script:archive.GetEntry($entryPath)
    if (-not $entry) { return $null }

    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { $json = $reader.ReadToEnd() | ConvertFrom-Json }
    finally { $reader.Dispose() }
    $script:jsonCache[$entryPath] = $json
    return $json
}

function Get-ResolvedModel([string]$modelPath) {
    $modelPath = $modelPath -replace '^minecraft:', ''
    if ($script:modelCache.ContainsKey($modelPath)) { return $script:modelCache[$modelPath] }
    $model = Read-ArchiveJson "assets/minecraft/models/$modelPath.json"
    if (-not $model) { return $null }

    $parentModel = $null
    if ($model.parent) { $parentModel = Get-ResolvedModel ([string]$model.parent) }
    $textures = @{}
    if ($parentModel) {
        foreach ($texture in $parentModel.Textures.GetEnumerator()) { $textures[$texture.Key] = $texture.Value }
    }
    if ($model.textures) {
        foreach ($texture in $model.textures.PSObject.Properties) { $textures[$texture.Name] = [string]$texture.Value }
    }

    $elements = $model.elements
    if (-not $elements -and $parentModel) { $elements = $parentModel.Elements }
    $hasRotation = $false
    foreach ($element in @($elements)) {
        if ($element.rotation) { $hasRotation = $true; break }
    }

    $resolved = [PSCustomObject]@{ Textures = $textures; Elements = @($elements); HasRotation = $hasRotation }
    $script:modelCache[$modelPath] = $resolved
    return $resolved
}

function Add-BlockModelReferences($node, [System.Collections.Generic.List[string]]$references) {
    if ($node -is [System.Management.Automation.PSCustomObject]) {
        foreach ($property in $node.PSObject.Properties) {
            if ($property.Name -eq 'model' -and $property.Value -is [string] -and $property.Value.StartsWith('minecraft:block/')) {
                if (-not $references.Contains($property.Value)) { $references.Add($property.Value) }
            }
            else {
                Add-BlockModelReferences $property.Value $references
            }
        }
    }
    elseif ($node -is [array]) {
        foreach ($value in $node) { Add-BlockModelReferences $value $references }
    }
}

function Get-BlockModel([string]$itemName) {
    $itemDefinition = Read-ArchiveJson "assets/minecraft/items/$itemName.json"
    $references = [System.Collections.Generic.List[string]]::new()
    if ($itemDefinition) { Add-BlockModelReferences $itemDefinition $references }
    $modelPath = if ($references.Count -gt 0) { $references[0] } else { "minecraft:block/$itemName" }
    return Get-ResolvedModel $modelPath
}

function Get-TextureAsset([string]$textureName) {
    $textureName = $textureName -replace '^minecraft:', ''
    $entryPath = "assets/minecraft/textures/$textureName.png"
    if ($script:textureCache.ContainsKey($entryPath)) {
        $cachedAsset = $script:textureCache[$entryPath]
        if ($cachedAsset.Width -eq $cachedAsset.Height -and -not $script:activeTextureIds.ContainsKey($cachedAsset.Id)) {
            $script:activeTextureIds[$cachedAsset.Id] = $true
            $null = $script:activeTextureDefinitions.AppendLine("      <image id=`"$($cachedAsset.Id)`" width=`"$($cachedAsset.Width)`" height=`"$($cachedAsset.Height)`" image-rendering=`"pixelated`" href=`"data:image/png;base64,$($cachedAsset.Data)`"/>")
        }
        return $cachedAsset
    }
    $entry = $script:archive.GetEntry($entryPath)
    if (-not $entry) { return $null }

    $source = $entry.Open()
    $memory = [System.IO.MemoryStream]::new()
    try {
        $source.CopyTo($memory)
        $bytes = $memory.ToArray()
    }
    finally {
        $memory.Dispose()
        $source.Dispose()
    }

    if ($bytes.Length -lt 24) { return $null }
    $width = [System.Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($bytes, 16))
    $height = [System.Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($bytes, 20))
    $id = 'texture-' + ($textureName -replace '[^a-zA-Z0-9_-]', '-')
    $asset = [PSCustomObject]@{ Id = $id; Data = [Convert]::ToBase64String($bytes); Width = $width; Height = $height }
    $script:textureCache[$entryPath] = $asset

    if ($width -eq $height -and -not $script:activeTextureIds.ContainsKey($id)) {
        $script:activeTextureIds[$id] = $true
        $null = $script:activeTextureDefinitions.AppendLine("      <image id=`"$id`" width=`"$width`" height=`"$height`" image-rendering=`"pixelated`" href=`"data:image/png;base64,$($asset.Data)`"/>")
    }
    return $asset
}

function Resolve-TextureName([string]$textureReference, [hashtable]$textures) {
    $resolved = $textureReference
    for ($depth = 0; $depth -lt 12 -and $resolved.StartsWith('#'); $depth++) {
        $key = $resolved.Substring(1)
        if (-not $textures.ContainsKey($key)) { return $null }
        $resolved = [string]$textures[$key]
    }
    if ($resolved.StartsWith('#')) { return $null }
    return $resolved
}

function Format-SvgNumber([double]$number) {
    return $number.ToString('0.####', [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-ProjectedPoint([double]$x, [double]$y, [double]$z) {
    return [PSCustomObject]@{
        X = 8 + (($x * 7 - $z * 5) / 16)
        Y = 1 + (($x * 3 + $z * 5) / 16) + ((16 - $y) * 6 / 16)
    }
}

function Get-RotatedPoint([double[]]$point, $rotation) {
    $x = $point[0]
    $y = $point[1]
    $z = $point[2]
    if ($rotation) {
        $origin = @($rotation.origin | ForEach-Object { [double]$_ })
        if ($origin.Count -ne 3) { return $null }
        $relativeX = $x - $origin[0]
        $relativeY = $y - $origin[1]
        $relativeZ = $z - $origin[2]
        $angle = [double]$rotation.angle * [Math]::PI / 180
        $cosine = [Math]::Cos($angle)
        $sine = [Math]::Sin($angle)
        switch ([string]$rotation.axis) {
            'x' { $y = ($relativeY * $cosine) - ($relativeZ * $sine) + $origin[1]; $z = ($relativeY * $sine) + ($relativeZ * $cosine) + $origin[2] }
            'y' { $x = ($relativeX * $cosine) + ($relativeZ * $sine) + $origin[0]; $z = (-$relativeX * $sine) + ($relativeZ * $cosine) + $origin[2] }
            'z' { $x = ($relativeX * $cosine) - ($relativeY * $sine) + $origin[0]; $y = ($relativeX * $sine) + ($relativeY * $cosine) + $origin[1] }
            default { return $null }
        }
    }
    return [PSCustomObject]@{ X = $x; Y = $y; Z = $z }
}

function Get-RotatedNormal([double[]]$normal, $rotation) {
    $x = $normal[0]
    $y = $normal[1]
    $z = $normal[2]
    if ($rotation) {
        $angle = [double]$rotation.angle * [Math]::PI / 180
        $cosine = [Math]::Cos($angle)
        $sine = [Math]::Sin($angle)
        switch ([string]$rotation.axis) {
            'x' { $nextY = ($y * $cosine) - ($z * $sine); $nextZ = ($y * $sine) + ($z * $cosine); $y = $nextY; $z = $nextZ }
            'y' { $nextX = ($x * $cosine) + ($z * $sine); $nextZ = (-$x * $sine) + ($z * $cosine); $x = $nextX; $z = $nextZ }
            'z' { $nextX = ($x * $cosine) - ($y * $sine); $nextY = ($x * $sine) + ($y * $cosine); $x = $nextX; $y = $nextY }
            default { return $null }
        }
    }
    return [PSCustomObject]@{ X = $x; Y = $y; Z = $z }
}

function Get-BlockModelMarkup([string]$itemName) {
    $model = Get-BlockModel $itemName
    $script:modelSkipReason = 'unknown'
    if (-not $model) { $script:modelSkipReason = 'missing-model'; return $null }
    if ($model.Elements.Count -eq 0) { $script:modelSkipReason = 'no-elements'; return $null }

    $markup = [System.Text.StringBuilder]::new()
    $faceCount = 0
    foreach ($element in $model.Elements) {
        $from = @($element.from | ForEach-Object { [double]$_ })
        $to = @($element.to | ForEach-Object { [double]$_ })
        if ($from.Count -ne 3 -or $to.Count -ne 3) { $script:modelSkipReason = 'invalid-geometry'; return $null }

        $rotation = $element.rotation
        $faceDefinitions = @(
            @{ Name = 'north'; Normal = @(0, 0, -1); Corners = @(@($from[0], $to[1], $from[2]), @($to[0], $to[1], $from[2]), @($to[0], $from[1], $from[2]), @($from[0], $from[1], $from[2])) },
            @{ Name = 'east'; Normal = @(1, 0, 0); Corners = @(@($to[0], $to[1], $from[2]), @($to[0], $to[1], $to[2]), @($to[0], $from[1], $to[2]), @($to[0], $from[1], $from[2])) },
            @{ Name = 'south'; Normal = @(0, 0, 1); Corners = @(@($to[0], $to[1], $to[2]), @($from[0], $to[1], $to[2]), @($from[0], $from[1], $to[2]), @($to[0], $from[1], $to[2])) },
            @{ Name = 'west'; Normal = @(-1, 0, 0); Corners = @(@($from[0], $to[1], $to[2]), @($from[0], $to[1], $from[2]), @($from[0], $from[1], $from[2]), @($from[0], $from[1], $to[2])) },
            @{ Name = 'up'; Normal = @(0, 1, 0); Corners = @(@($from[0], $to[1], $from[2]), @($to[0], $to[1], $from[2]), @($to[0], $to[1], $to[2]), @($from[0], $to[1], $to[2])) },
            @{ Name = 'down'; Normal = @(0, -1, 0); Corners = @(@($from[0], $from[1], $to[2]), @($to[0], $from[1], $to[2]), @($to[0], $from[1], $from[2]), @($from[0], $from[1], $from[2])) }
        )

        foreach ($faceDefinition in $faceDefinitions) {
            $direction = $faceDefinition.Name
            $faceProperty = $element.faces.PSObject.Properties[$direction]
            if (-not $faceProperty) { continue }
            $normal = Get-RotatedNormal $faceDefinition.Normal $rotation
            if (-not $normal -or (($normal.X + $normal.Y - ($normal.Z * .7)) -le 0.001)) { continue }
            $face = $faceProperty.Value
            $textureName = Resolve-TextureName ([string]$face.texture) $model.Textures
            if (-not $textureName) { continue }
            $texture = Get-TextureAsset $textureName
            if (-not $texture -or $texture.Width -ne $texture.Height) { $script:modelSkipReason = 'unsupported-texture'; return $null }

            switch ($direction) {
                'up' {
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @([double]$from[0], [double]$from[2], [double]$to[0], [double]$to[2]) }
                }
                'north' {
                    $u0 = 16.0 - [double]$to[0]
                    $v0 = 16.0 - [double]$to[1]
                    $u1 = 16.0 - [double]$from[0]
                    $v1 = 16.0 - [double]$from[1]
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @($u0, $v0, $u1, $v1) }
                }
                'east' {
                    $u0 = 16.0 - [double]$to[2]
                    $v0 = 16.0 - [double]$to[1]
                    $u1 = 16.0 - [double]$from[2]
                    $v1 = 16.0 - [double]$from[1]
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @($u0, $v0, $u1, $v1) }
                }
                'south' {
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @([double]$from[0], 16.0 - [double]$to[1], [double]$to[0], 16.0 - [double]$from[1]) }
                }
                'west' {
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @([double]$from[2], 16.0 - [double]$to[1], [double]$to[2], 16.0 - [double]$from[1]) }
                }
                'down' {
                    $uv = if ($face.uv) { @($face.uv | ForEach-Object { [double]$_ }) } else { @([double]$from[0], 16.0 - [double]$to[2], [double]$to[0], 16.0 - [double]$from[2]) }
                }
            }

            if ($uv.Count -ne 4) { continue }
            $uvScale = $texture.Width / 16
            $uvX = [double]$uv[0] * $uvScale
            $uvY = [double]$uv[1] * $uvScale
            $uvWidth = ([double]$uv[2] - [double]$uv[0]) * $uvScale
            $uvHeight = ([double]$uv[3] - [double]$uv[1]) * $uvScale
            if ($uvWidth -eq 0 -or $uvHeight -eq 0) { continue }

            $points = @()
            foreach ($corner in $faceDefinition.Corners) {
                $rotated = Get-RotatedPoint $corner $rotation
                if (-not $rotated) { $script:modelSkipReason = 'unsupported-rotation'; return $null }
                $points += Get-ProjectedPoint $rotated.X $rotated.Y $rotated.Z
            }
            $p0 = $points[0]
            $p1 = $points[1]
            $p2 = $points[2]
            $p3 = $points[3]
            $a = ($p1.X - $p0.X) / 16
            $b = ($p1.Y - $p0.Y) / 16
            $c = ($p3.X - $p0.X) / 16
            $d = ($p3.Y - $p0.Y) / 16
            $matrix = "matrix($(Format-SvgNumber $a) $(Format-SvgNumber $b) $(Format-SvgNumber $c) $(Format-SvgNumber $d) $(Format-SvgNumber $p0.X) $(Format-SvgNumber $p0.Y))"
            $pointText = @()
            foreach ($point in $points) { $pointText += "$(Format-SvgNumber $point.X),$(Format-SvgNumber $point.Y)" }
            $shade = [Math]::Min(.26, [Math]::Max(0, .2 * (1 - [Math]::Max(0, $normal.Y))))
            $null = $markup.AppendLine("    <svg x=`"0`" y=`"0`" width=`"16`" height=`"16`" viewBox=`"$(Format-SvgNumber $uvX) $(Format-SvgNumber $uvY) $(Format-SvgNumber $uvWidth) $(Format-SvgNumber $uvHeight)`" preserveAspectRatio=`"none`" overflow=`"hidden`" transform=`"$matrix`">")
            $null = $markup.AppendLine("      <use href=`"#$($texture.Id)`" width=`"$($texture.Width)`" height=`"$($texture.Height)`" image-rendering=`"pixelated`"/>")
            $null = $markup.AppendLine('    </svg>')
            if ($shade -gt 0) {
                $null = $markup.AppendLine("    <polygon points=`"$($pointText -join ' ')`" fill=`"#000`" fill-opacity=`"$(Format-SvgNumber $shade)`"/>")
            }
            $faceCount++
        }
    }

    if ($faceCount -eq 0) { $script:modelSkipReason = 'no-visible-faces'; return $null }
    return $markup.ToString()
}

try {
    foreach ($category in $spriteMapCategories) {
        $categoryItems = @($items | Where-Object { $_.category -eq $category } | Sort-Object name)
        $script:activeTextureDefinitions = [System.Text.StringBuilder]::new()
        $script:activeTextureIds = @{}
        $symbolMarkup = [System.Text.StringBuilder]::new()
        $extractedCount = 0
        $modelCount = 0
        $modelSkipCounts = @{}
        $modelSkipExamples = @{}

        foreach ($item in $categoryItems) {
            $itemName = $item.name
            if ($itemName -notmatch '^[a-z0-9_]+$') {
                throw "Unexpected item name: $itemName"
            }

            $textureNames = [System.Collections.Generic.List[string]]::new()
            if ($textureAliases.ContainsKey($itemName)) {
                $textureNames.Add($textureAliases[$itemName])
            }
            $textureNames.Add($itemName)

            $entry = $null
            foreach ($textureName in $textureNames) {
                $entry = $archive.GetEntry("assets/minecraft/textures/item/$textureName.png")
                if (-not $entry -and $category.StartsWith('blocks-')) {
                    $entry = $archive.GetEntry("assets/minecraft/textures/block/$textureName.png")
                }
                if ($entry) { break }
            }

            $modelMarkup = $null
            if ($category.StartsWith('blocks-')) {
                $modelMarkup = Get-BlockModelMarkup $itemName
                if (-not $modelMarkup) {
                    $reason = $script:modelSkipReason
                    if (-not $modelSkipCounts.ContainsKey($reason)) {
                        $modelSkipCounts[$reason] = 0
                        $modelSkipExamples[$reason] = [System.Collections.Generic.List[string]]::new()
                    }
                    $modelSkipCounts[$reason]++
                    if ($modelSkipExamples[$reason].Count -lt 3) { $modelSkipExamples[$reason].Add($itemName) }
                }
            }

            $null = $symbolMarkup.AppendLine("  <symbol id=`"$itemName`" viewBox=`"0 0 16 16`">")
            if ($modelMarkup) {
                $null = $symbolMarkup.Append($modelMarkup)
                $modelCount++
            }
            elseif ($entry) {
                $source = $entry.Open()
                $image = [System.IO.MemoryStream]::new()
                try {
                    $source.CopyTo($image)
                    $base64 = [Convert]::ToBase64String($image.ToArray())
                }
                finally {
                    $image.Dispose()
                    $source.Dispose()
                }
                $null = $symbolMarkup.AppendLine("    <image width=`"16`" height=`"16`" preserveAspectRatio=`"xMidYMid meet`" image-rendering=`"pixelated`" href=`"data:image/png;base64,$base64`"/>")
                $extractedCount++
            }
            $null = $symbolMarkup.AppendLine('  </symbol>')
        }

        $svg = [System.Text.StringBuilder]::new()
        $null = $svg.AppendLine('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">')
        $null = $svg.AppendLine('  <defs>')
        $null = $svg.Append($script:activeTextureDefinitions)
        $null = $svg.AppendLine('  </defs>')
        $null = $svg.Append($symbolMarkup)
        $null = $svg.AppendLine('</svg>')
        $outputPath = Join-Path $OutputDirectory "$category-sprites.svg"
        [System.IO.File]::WriteAllText($outputPath, $svg.ToString(), [System.Text.UTF8Encoding]::new($false))
        $skipSummary = ($modelSkipCounts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value) [$($modelSkipExamples[$_.Key] -join ',')]" }) -join '; '
        Write-Output "$category`: $modelCount model renders, $extractedCount flat textures, $($categoryItems.Count) total; $skipSummary"
    }
}
finally {
    $archive.Dispose()
}