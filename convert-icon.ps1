# Convert JPG to PNG icons for PWA
Add-Type -AssemblyName System.Drawing

$inputFile = "icon-nen-xanh.jpg"
$sizes = @(192, 512)

foreach ($size in $sizes) {
    $outputFile = "icon-$size.png"
    
    # Load image
    $image = [System.Drawing.Image]::FromFile((Resolve-Path $inputFile))
    
    # Create new bitmap with target size
    $newImage = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($newImage)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($image, 0, 0, $size, $size)
    
    # Save as PNG
    $newImage.Save((Join-Path (Get-Location) $outputFile), [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $graphics.Dispose()
    $newImage.Dispose()
    $image.Dispose()
    
    Write-Host "Created $outputFile"
}

Write-Host "Done!"
