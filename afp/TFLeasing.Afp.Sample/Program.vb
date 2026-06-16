Imports System.IO
Imports TFLeasing.Afp

Namespace Global.TFLeasing.Afp.Sample

    ''' <summary>
    ''' Generates a one-page AFP document that looks like a simple TF Leasing
    ''' funding proposal, demonstrating the high-level <see cref="AfpDocumentWriter"/>.
    ''' Run with an optional output path: <c>dotnet run -- proposal.afp</c>
    ''' </summary>
    Module Program

        Sub Main(args As String())
            Dim path = If(args IsNot Nothing AndAlso args.Length > 0, args(0), "proposal.afp")

            Using fs = File.Create(path)
                Using doc As New AfpDocumentWriter(fs)
                    ' Map two coded fonts to local ids 1 (heading) and 2 (body).
                    ' These are example IBM core font resource names; substitute the
                    ' code page / font character set names available on your printer.
                    doc.MapFont(1, "T1V10037", "C0H300B0") ' Helvetica bold 12pt-ish
                    doc.MapFont(2, "T1V10037", "C0H200B0") ' Helvetica medium

                    doc.BeginDocument("PROPOSAL")
                    doc.BeginPage(8.27, 11.69) ' A4 in inches

                    doc.DrawString(1, 1.0, 1.2, "TF Leasing — Funding Proposal")
                    doc.DrawString(2, 1.0, 1.7, "Customer:    Example Haulage Ltd")
                    doc.DrawString(2, 1.0, 2.0, "Vehicle:     2026 Volvo FH 460")
                    doc.DrawString(2, 1.0, 2.3, "Term:        48 months")
                    doc.DrawString(2, 1.0, 2.6, "Monthly:     GBP 1,495.00 + VAT")
                    doc.DrawString(2, 1.0, 2.9, "Funder:      Example Asset Finance")

                    doc.EndPage()
                    doc.EndDocument()
                End Using
            End Using

            Console.WriteLine($"Wrote AFP document to {Path.GetFullPath(path)}")
        End Sub

    End Module

End Namespace
