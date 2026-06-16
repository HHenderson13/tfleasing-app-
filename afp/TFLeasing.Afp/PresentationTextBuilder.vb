Imports System.Collections.Generic

Namespace Global.TFLeasing.Afp

    ''' <summary>
    ''' Builds PTOCA (Presentation Text Object Content Architecture) control
    ''' sequences for placement inside one or more PTX structured fields.
    '''
    ''' A PTX data payload is a chain of control sequences introduced once by the
    ''' control-sequence prefix X'2B D3'. Each control sequence is encoded as:
    '''   1 byte   length      length of this control sequence INCLUDING the
    '''                        length byte and the function-type byte, but NOT
    '''                        the X'2B D3' prefix
    '''   1 byte   type        function type code (chained form, low bit = 0)
    '''   n bytes  parameters
    '''
    ''' This builder records each control sequence as a discrete segment so the
    ''' writer can pack them into one or more PTX fields without ever splitting a
    ''' sequence across a field boundary.
    ''' </summary>
    Public NotInheritable Class PresentationTextBuilder

        ' Chained control-sequence function type codes (low-order bit = 0).
        Private Const STO As Byte = &HF6 ' Set Text Orientation
        Private Const SCFL As Byte = &HF0 ' Set Coded Font Local
        Private Const AMI As Byte = &HC6 ' Absolute Move Inline
        Private Const AMB As Byte = &HD2 ' Absolute Move Baseline
        Private Const RMI As Byte = &HC8 ' Relative Move Inline
        Private Const RMB As Byte = &HD4 ' Relative Move Baseline
        Private Const TRN As Byte = &HDA ' Transparent Data (the text itself)
        Private Const NOPCS As Byte = &HF8 ' No Operation

        ''' <summary>Maximum text bytes carried by a single TRN control sequence.</summary>
        Public Const MaxTrnTextBytes As Integer = 253 ' 255 - length byte - type byte

        Private ReadOnly _segments As New List(Of Byte())()

        ''' <summary>The individual control sequences, in order.</summary>
        Public ReadOnly Property Segments As IReadOnlyList(Of Byte())
            Get
                Return _segments
            End Get
        End Property

        ''' <summary>True when no control sequences have been added yet.</summary>
        Public ReadOnly Property IsEmpty As Boolean
            Get
                Return _segments.Count = 0
            End Get
        End Property

        Private Sub Add(type As Byte, ParamArray params() As Byte)
            Dim length = 2 + If(params Is Nothing, 0, params.Length)
            Dim seq(length - 1) As Byte
            seq(0) = CByte(length)
            seq(1) = type
            If params IsNot Nothing Then Array.Copy(params, 0, seq, 2, params.Length)
            _segments.Add(seq)
        End Sub

        Private Shared Function Be16(value As Integer) As Byte()
            Return New Byte() {CByte((value >> 8) And &HFF), CByte(value And &HFF)}
        End Function

        ''' <summary>
        ''' Set the text orientation. Values are MO:DCA orientation codes:
        ''' 0x0000 = 0°, 0x2D00 = 90°, 0x5A00 = 180°, 0x8700 = 270°. The default
        ''' upright orientation is inline 0° / baseline 90°.
        ''' </summary>
        Public Function SetTextOrientation(Optional inlineOrientation As Integer = &H0,
                                           Optional baselineOrientation As Integer = &H2D00) As PresentationTextBuilder
            Dim i = Be16(inlineOrientation)
            Dim b = Be16(baselineOrientation)
            Add(STO, i(0), i(1), b(0), b(1))
            Return Me
        End Function

        ''' <summary>Select the coded font previously mapped to <paramref name="localFontId"/> by an MCF.</summary>
        Public Function SetFont(localFontId As Byte) As PresentationTextBuilder
            Add(SCFL, localFontId)
            Return Me
        End Function

        ''' <summary>Move the inline (X) text position to an absolute coordinate, in text units.</summary>
        Public Function MoveInline(units As Integer) As PresentationTextBuilder
            Dim v = Be16(units)
            Add(AMI, v(0), v(1))
            Return Me
        End Function

        ''' <summary>Move the baseline (Y) text position to an absolute coordinate, in text units.</summary>
        Public Function MoveBaseline(units As Integer) As PresentationTextBuilder
            Dim v = Be16(units)
            Add(AMB, v(0), v(1))
            Return Me
        End Function

        ''' <summary>Move the inline (X) position by a relative amount, in text units.</summary>
        Public Function MoveInlineRelative(units As Integer) As PresentationTextBuilder
            Dim v = Be16(units)
            Add(RMI, v(0), v(1))
            Return Me
        End Function

        ''' <summary>Move the baseline (Y) position by a relative amount, in text units.</summary>
        Public Function MoveBaselineRelative(units As Integer) As PresentationTextBuilder
            Dim v = Be16(units)
            Add(RMB, v(0), v(1))
            Return Me
        End Function

        ''' <summary>
        ''' Emit text at the current position. The string is converted to EBCDIC
        ''' (CP037) and split into as many TRN control sequences as needed to stay
        ''' within the 253-byte per-sequence limit.
        ''' </summary>
        Public Function DrawText(text As String) As PresentationTextBuilder
            Dim bytes = Ebcdic.ToEbcdic(text)
            Return DrawRaw(bytes)
        End Function

        ''' <summary>Emit already-encoded (EBCDIC, or code-page-appropriate) bytes as transparent data.</summary>
        Public Function DrawRaw(bytes As Byte()) As PresentationTextBuilder
            If bytes Is Nothing OrElse bytes.Length = 0 Then Return Me
            Dim offset = 0
            While offset < bytes.Length
                Dim chunk = Math.Min(MaxTrnTextBytes, bytes.Length - offset)
                Dim params(chunk - 1) As Byte
                Array.Copy(bytes, offset, params, 0, chunk)
                Add(TRN, params)
                offset += chunk
            End While
            Return Me
        End Function

        ''' <summary>Emit a No-Operation control sequence (handy for padding/alignment).</summary>
        Public Function NoOp() As PresentationTextBuilder
            Add(NOPCS)
            Return Me
        End Function

    End Class

End Namespace
