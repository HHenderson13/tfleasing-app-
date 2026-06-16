Imports System.Text

Namespace Global.TFLeasing.Afp

    ''' <summary>
    ''' ASCII / Latin-1 to EBCDIC (code page 037) conversion.
    '''
    ''' AFP coded fonts expect text in EBCDIC, but .NET Core / .NET 5+ do not ship
    ''' the EBCDIC code pages by default (they require the
    ''' System.Text.Encoding.CodePages provider). To keep this library
    ''' dependency-free we carry an explicit translation table for the printable
    ''' range, which is all an AFP text stream realistically needs.
    '''
    ''' Only the lower 128 (7-bit ASCII) code points are mapped exactly to
    ''' CP037. Bytes 128-255 are mapped to the EBCDIC substitute character
    ''' (0x3F) because the upper half of CP037 is rarely needed for the
    ''' Latin business text this library targets.
    ''' </summary>
    Public Module Ebcdic

        ''' <summary>The EBCDIC substitute character used for unmappable input.</summary>
        Public Const Substitute As Byte = &H3F

        ''' <summary>The EBCDIC space character.</summary>
        Public Const Space As Byte = &H40

        ' ASCII (index) -> EBCDIC CP037 (value), for code points 0..127.
        Private ReadOnly AsciiToCp037() As Byte = New Byte() {
            &H0, &H1, &H2, &H3, &H37, &H2D, &H2E, &H2F, &H16, &H5, &H25, &HB, &HC, &HD, &HE, &HF,
            &H10, &H11, &H12, &H13, &H3C, &H3D, &H32, &H26, &H18, &H19, &H3F, &H27, &H1C, &H1D, &H1E, &H1F,
            &H40, &H5A, &H7F, &H7B, &H5B, &H6C, &H50, &H7D, &H4D, &H5D, &H5C, &H4E, &H6B, &H60, &H4B, &H61,
            &HF0, &HF1, &HF2, &HF3, &HF4, &HF5, &HF6, &HF7, &HF8, &HF9, &H7A, &H5E, &H4C, &H7E, &H6E, &H6F,
            &H7C, &HC1, &HC2, &HC3, &HC4, &HC5, &HC6, &HC7, &HC8, &HC9, &HD1, &HD2, &HD3, &HD4, &HD5, &HD6,
            &HD7, &HD8, &HD9, &HE2, &HE3, &HE4, &HE5, &HE6, &HE7, &HE8, &HE9, &HAD, &HE0, &HBD, &H5F, &H6D,
            &H79, &H81, &H82, &H83, &H84, &H85, &H86, &H87, &H88, &H89, &H91, &H92, &H93, &H94, &H95, &H96,
            &H97, &H98, &H99, &HA2, &HA3, &HA4, &HA5, &HA6, &HA7, &HA8, &HA9, &HC0, &H4F, &HD0, &HA1, &H7
        }

        ''' <summary>Convert a single character to its EBCDIC (CP037) byte.</summary>
        Public Function ToEbcdic(c As Char) As Byte
            Dim code = AscW(c)
            If code >= 0 AndAlso code < AsciiToCp037.Length Then
                Return AsciiToCp037(code)
            End If
            Return Substitute
        End Function

        ''' <summary>Convert a string to an EBCDIC (CP037) byte array.</summary>
        Public Function ToEbcdic(text As String) As Byte()
            If text Is Nothing Then Return New Byte(-1) {}
            Dim result(text.Length - 1) As Byte
            For i = 0 To text.Length - 1
                result(i) = ToEbcdic(text(i))
            Next
            Return result
        End Function

        ''' <summary>
        ''' Convert a string to EBCDIC and pad/truncate it to a fixed length using
        ''' the EBCDIC space (0x40). AFP resource names (code pages, font character
        ''' sets) are fixed 8-byte, blank-padded fields.
        ''' </summary>
        Public Function ToEbcdicFixed(text As String, length As Integer) As Byte()
            Dim result(length - 1) As Byte
            For i = 0 To length - 1
                result(i) = Space
            Next
            If text IsNot Nothing Then
                Dim n = Math.Min(text.Length, length)
                For i = 0 To n - 1
                    result(i) = ToEbcdic(text(i))
                Next
            End If
            Return result
        End Function

    End Module

End Namespace
