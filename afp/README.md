# TFLeasing.Afp

A small, dependency-free **VB.NET class library for creating AFP (Advanced
Function Presentation / MO:DCA-P) print files**.

AFP is IBM's page-description / print-data-stream architecture. This library
emits the structured-field stream directly, so you can generate `.afp`
documents from .NET without a printer driver or any third-party package.

- Target framework: **.NET Standard 2.0** — usable from .NET Framework
  4.6.1+, .NET 5/6/7/8+, and Mono.
- No external NuGet dependencies.

## Projects

| Project | What it is |
|---------|------------|
| `TFLeasing.Afp` | The class library. |
| `TFLeasing.Afp.Sample` | A console app that writes a sample one-page proposal `.afp`. |

## Quick start

```vbnet
Imports System.IO
Imports TFLeasing.Afp

Using fs = File.Create("hello.afp")
    Using doc As New AfpDocumentWriter(fs)
        ' Map a coded font to a local id used by the text stream.
        doc.MapFont(1, codePageName:="T1V10037", fontCharacterSetName:="C0H200B0")

        doc.BeginDocument("HELLO")
        doc.BeginPage(widthInches:=8.5, heightInches:=11.0)

        ' x / y are inches from the top-left; y is the text baseline.
        doc.DrawString(localFontId:=1, xInches:=1.0, yInches:=1.0, text:="Hello, AFP world")

        doc.EndPage()
        doc.EndDocument()
    End Using
End Using
```

Build and run the sample:

```bash
cd afp
dotnet run --project TFLeasing.Afp.Sample -- proposal.afp
```

## What it generates

For each document the writer emits a correctly framed MO:DCA structured-field
stream:

```
BDT  Begin Document
  BPG  Begin Page
    BAG  Begin Active Environment Group
      PGD  Page Descriptor          (page size, 1440 units/inch)
      MCF  Map Coded Font           (binds local font ids -> code page + font char set)
      PTD  Presentation Text Descriptor
    EAG  End Active Environment Group
    BPT  Begin Presentation Text
      PTX  Presentation Text Data   (STO, SCFL, AMI, AMB, TRN control sequences)
    EPT  End Presentation Text
  EPG  End Page
EDT  End Document
```

Each structured field uses the AFP print-file framing: an `X'5A'` introducer,
a 2-byte length, the 3-byte structured-field identifier, a flag byte, two
reserved bytes, then the data.

## Design notes

- **Coordinate system.** Pages and text use a 1440-units-per-inch logical grid
  (`AfpDocumentWriter.UnitsPerInch`). `DrawString` takes inches and converts.
- **Text encoding.** Strings are translated to **EBCDIC (code page 037)** via
  `Ebcdic`, because AFP coded fonts expect EBCDIC. .NET Core does not ship
  EBCDIC encodings, so the table is built in. Only 7-bit ASCII is mapped
  exactly; other code points become the EBCDIC substitute (`0x3F`).
- **Long text & paging.** Text longer than a single `TRN` (253 bytes) is split
  automatically, and control sequences are packed into as many `PTX` fields as
  needed without ever splitting a sequence.
- **Fonts are not embedded.** `MapFont` references resources (a code page and a
  font character set) that must exist on the printer / AFP viewer. The sample
  uses example IBM core-font names — replace them with names valid for your
  environment.

## Low-level API

If you need finer control than `DrawString`, drive the PTOCA stream directly:

```vbnet
doc.BeginPage(8.5, 11.0)
With doc.PageText
    .SetFont(1)
    .MoveInline(1440)      ' 1 inch across
    .MoveBaseline(2880)    ' 2 inches down (baseline)
    .DrawText("Positioned exactly")
End With
doc.EndPage()
```

`StructuredFieldWriter` exposes the raw framing if you want to emit fields this
library does not model.

## References

- IBM *MO:DCA Reference* (SC31-6802) — structured fields and triplets.
- IBM *PTOCA Reference* (SC31-6803) — presentation-text control sequences.

## Status / caveats

This was written against the MO:DCA / PTOCA references and has not yet been
validated against a specific AFP transform (e.g. AFP Workbench, Ricoh/InfoPrint,
or `afp2pdf`). The structured-field framing, document/page envelope, PTOCA text
sequences and EBCDIC handling are the well-specified core. If your target
transform rejects the font mapping, adjust the triplet/resource-type constants
in `FontMapping.vb` to match the resources it expects.
