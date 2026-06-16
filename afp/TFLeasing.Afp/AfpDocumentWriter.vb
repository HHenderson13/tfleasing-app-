Imports System.Collections.Generic
Imports System.IO

Namespace Global.TFLeasing.Afp

    ''' <summary>
    ''' High-level writer that produces a complete MO:DCA-P (AFP) print-file
    ''' stream. It manages the document / page / active-environment-group /
    ''' presentation-text nesting and the required descriptor fields so callers
    ''' can think in terms of pages, fonts and positioned text.
    '''
    ''' Typical use:
    ''' <code>
    ''' Using fs = File.Create("hello.afp")
    '''     Using doc = New AfpDocumentWriter(fs)
    '''         doc.MapFont(1, "T1V10037", "C0H200B0")
    '''         doc.BeginDocument("HELLO")
    '''         doc.BeginPage(8.5, 11.0)
    '''         doc.DrawString(1, 1.0, 1.0, "Hello, AFP world")
    '''         doc.EndPage()
    '''         doc.EndDocument()
    '''     End Using
    ''' End Using
    ''' </code>
    ''' </summary>
    Public NotInheritable Class AfpDocumentWriter
        Implements IDisposable

        ''' <summary>Logical units per inch used for the page and text coordinate systems.</summary>
        Public Const UnitsPerInch As Integer = 1440
        Private Const UnitBaseTenInches As Byte = &H0      ' unit base 0 = 10 inches
        Private Const UnitsPerUnitBase As Integer = UnitsPerInch * 10 ' 14400

        Private ReadOnly _sf As StructuredFieldWriter
        Private ReadOnly _fonts As New List(Of FontMapping)()

        Private _documentName As String
        Private _pageText As PresentationTextBuilder
        Private _pageWidthUnits As Integer
        Private _pageHeightUnits As Integer
        Private _pageCounter As Integer
        Private _inDocument As Boolean
        Private _inPage As Boolean
        Private _disposed As Boolean

        Public Sub New(output As Stream)
            _sf = New StructuredFieldWriter(output)
        End Sub

        ''' <summary>
        ''' Register a coded font so it is available to every page via the Map
        ''' Coded Font field. Call before <see cref="BeginPage"/>.
        ''' </summary>
        Public Sub MapFont(localId As Byte, codePageName As String, fontCharacterSetName As String)
            If _inPage Then Throw New InvalidOperationException("Map fonts before beginning a page.")
            _fonts.Add(New FontMapping(localId, codePageName, fontCharacterSetName))
        End Sub

        ''' <summary>Begin the document. <paramref name="name"/> is a token of up to 8 characters.</summary>
        Public Sub BeginDocument(Optional name As String = "DOCUMENT")
            If _inDocument Then Throw New InvalidOperationException("Document already started.")
            _documentName = name
            _sf.Write(StructuredFieldId.BeginDocument, NameToken(name))
            _inDocument = True
        End Sub

        ''' <summary>Begin a page of the given size, in inches.</summary>
        Public Sub BeginPage(widthInches As Double, heightInches As Double)
            EnsureInDocument()
            If _inPage Then Throw New InvalidOperationException("End the current page before starting a new one.")

            _pageCounter += 1
            _pageWidthUnits = InchesToUnits(widthInches)
            _pageHeightUnits = InchesToUnits(heightInches)
            Dim pageName = "PAGE" & _pageCounter.ToString("0000")

            _sf.Write(StructuredFieldId.BeginPage, NameToken(pageName))

            ' Active environment group: descriptors that apply to the page content.
            _sf.Write(StructuredFieldId.BeginActiveEnvironmentGroup, NameToken("AEG" & _pageCounter.ToString("00000")))
            _sf.Write(StructuredFieldId.PageDescriptor, BuildPageDescriptor(_pageWidthUnits, _pageHeightUnits))
            If _fonts.Count > 0 Then
                _sf.Write(StructuredFieldId.MapCodedFont, MapCodedFontBuilder.Build(_fonts))
            End If
            _sf.Write(StructuredFieldId.PresentationTextDescriptor, BuildTextDescriptor(_pageWidthUnits, _pageHeightUnits))
            _sf.Write(StructuredFieldId.EndActiveEnvironmentGroup, NameToken("AEG" & _pageCounter.ToString("00000")))

            _pageText = New PresentationTextBuilder()
            _pageText.SetTextOrientation() ' upright (0 / 90)
            _inPage = True
        End Sub

        ''' <summary>The presentation-text builder for the current page (for advanced sequences).</summary>
        Public ReadOnly Property PageText As PresentationTextBuilder
            Get
                EnsureInPage()
                Return _pageText
            End Get
        End Property

        ''' <summary>
        ''' Convenience: select a font, position at (x, y) inches measured from the
        ''' top-left of the page, and draw a string. Y is the text baseline.
        ''' </summary>
        Public Sub DrawString(localFontId As Byte, xInches As Double, yInches As Double, text As String)
            EnsureInPage()
            _pageText.SetFont(localFontId).
                      MoveInline(InchesToUnits(xInches)).
                      MoveBaseline(InchesToUnits(yInches)).
                      DrawText(text)
        End Sub

        ''' <summary>Finish the current page, flushing its text into PTX fields.</summary>
        Public Sub EndPage()
            EnsureInPage()

            If Not _pageText.IsEmpty Then
                _sf.Write(StructuredFieldId.BeginPresentationText, NameToken("PT" & _pageCounter.ToString("000000")))
                WritePresentationText(_pageText)
                _sf.Write(StructuredFieldId.EndPresentationText, NameToken("PT" & _pageCounter.ToString("000000")))
            End If

            _sf.Write(StructuredFieldId.EndPage)
            _pageText = Nothing
            _inPage = False
        End Sub

        ''' <summary>Finish the document.</summary>
        Public Sub EndDocument()
            EnsureInDocument()
            If _inPage Then EndPage()
            _sf.Write(StructuredFieldId.EndDocument, NameToken(_documentName))
            _inDocument = False
        End Sub

        ' --- internals -------------------------------------------------------

        ''' <summary>
        ''' Pack the builder's control sequences into one or more PTX fields. The
        ''' X'2B D3' chained-sequence prefix begins each field and no individual
        ''' control sequence is split across a field boundary.
        ''' </summary>
        Private Sub WritePresentationText(builder As PresentationTextBuilder)
            Const prefixLen As Integer = 2 ' X'2B D3'
            Dim current As New List(Of Byte)() From {CByte(&H2B), CByte(&HD3)}

            For Each seg In builder.Segments
                If current.Count + seg.Length > StructuredFieldWriter.MaxDataLength Then
                    _sf.Write(StructuredFieldId.PresentationTextData, current.ToArray())
                    current = New List(Of Byte)() From {CByte(&H2B), CByte(&HD3)}
                End If
                current.AddRange(seg)
            Next

            If current.Count > prefixLen Then
                _sf.Write(StructuredFieldId.PresentationTextData, current.ToArray())
            End If
        End Sub

        Private Shared Function BuildPageDescriptor(widthUnits As Integer, heightUnits As Integer) As Byte()
            Dim d As New List(Of Byte)()
            d.Add(UnitBaseTenInches)               ' XpgBase
            d.Add(UnitBaseTenInches)               ' YpgBase
            d.AddRange(Be16(UnitsPerUnitBase))     ' XpgUnits
            d.AddRange(Be16(UnitsPerUnitBase))     ' YpgUnits
            d.AddRange(Be24(widthUnits))           ' XpgSize
            d.AddRange(Be24(heightUnits))          ' YpgSize
            d.AddRange(New Byte() {0, 0, 0})       ' reserved
            Return d.ToArray()
        End Function

        Private Shared Function BuildTextDescriptor(widthUnits As Integer, heightUnits As Integer) As Byte()
            Dim d As New List(Of Byte)()
            d.Add(UnitBaseTenInches)               ' XptBase
            d.Add(UnitBaseTenInches)               ' YptBase
            d.AddRange(Be16(UnitsPerUnitBase))     ' XptUnits
            d.AddRange(Be16(UnitsPerUnitBase))     ' YptUnits
            d.AddRange(Be16(widthUnits))           ' XptSize
            d.AddRange(Be16(heightUnits))          ' YptSize
            Return d.ToArray()
        End Function

        Private Shared Function NameToken(name As String) As Byte()
            ' Object names in Begin/End fields are 8-byte, blank-padded EBCDIC.
            Return Ebcdic.ToEbcdicFixed(name, 8)
        End Function

        Private Shared Function Be16(value As Integer) As Byte()
            Return New Byte() {CByte((value >> 8) And &HFF), CByte(value And &HFF)}
        End Function

        Private Shared Function Be24(value As Integer) As Byte()
            Return New Byte() {CByte((value >> 16) And &HFF), CByte((value >> 8) And &HFF), CByte(value And &HFF)}
        End Function

        Private Shared Function InchesToUnits(inches As Double) As Integer
            Return CInt(Math.Round(inches * UnitsPerInch))
        End Function

        Private Sub EnsureInDocument()
            If Not _inDocument Then Throw New InvalidOperationException("Call BeginDocument first.")
        End Sub

        Private Sub EnsureInPage()
            If Not _inPage Then Throw New InvalidOperationException("Call BeginPage first.")
        End Sub

        Public Sub Dispose() Implements IDisposable.Dispose
            If _disposed Then Return
            _disposed = True
            ' Best-effort close of any open structures so a forgotten call still
            ' yields a well-formed document.
            If _inPage Then EndPage()
            If _inDocument Then EndDocument()
        End Sub

    End Class

End Namespace
