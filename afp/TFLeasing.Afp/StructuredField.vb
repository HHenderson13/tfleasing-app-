Imports System.IO

Namespace Global.TFLeasing.Afp

    ''' <summary>
    ''' Three-byte MO:DCA structured field identifiers (SFIDs) used by this
    ''' library. The first byte (X'D3') is the AFP/MO:DCA object class; the
    ''' second byte is the field type (Begin/End/Descriptor/Map/Data); the third
    ''' byte is the object category (Document/Page/AEG/Presentation Text/...).
    ''' </summary>
    Public Module StructuredFieldId
        ' Document
        Public ReadOnly BeginDocument As Byte() = New Byte() {&HD3, &HA8, &HA8} ' BDT
        Public ReadOnly EndDocument As Byte() = New Byte() {&HD3, &HA9, &HA8}   ' EDT
        ' Page
        Public ReadOnly BeginPage As Byte() = New Byte() {&HD3, &HA8, &HAF}     ' BPG
        Public ReadOnly EndPage As Byte() = New Byte() {&HD3, &HA9, &HAF}       ' EPG
        Public ReadOnly PageDescriptor As Byte() = New Byte() {&HD3, &HA6, &HAF} ' PGD
        ' Active Environment Group
        Public ReadOnly BeginActiveEnvironmentGroup As Byte() = New Byte() {&HD3, &HA8, &HC9} ' BAG
        Public ReadOnly EndActiveEnvironmentGroup As Byte() = New Byte() {&HD3, &HA9, &HC9}   ' EAG
        ' Coded font mapping
        Public ReadOnly MapCodedFont As Byte() = New Byte() {&HD3, &HAB, &H8A}  ' MCF (format 2)
        ' Presentation text
        Public ReadOnly PresentationTextDescriptor As Byte() = New Byte() {&HD3, &HA6, &H9B} ' PTD-1
        Public ReadOnly BeginPresentationText As Byte() = New Byte() {&HD3, &HA8, &H9B}      ' BPT
        Public ReadOnly EndPresentationText As Byte() = New Byte() {&HD3, &HA9, &H9B}        ' EPT
        Public ReadOnly PresentationTextData As Byte() = New Byte() {&HD3, &HEE, &H9B}       ' PTX
    End Module

    ''' <summary>
    ''' Writes MO:DCA structured fields to a stream in the AFP "print file"
    ''' (stream) format, where each field is introduced by the X'5A' control
    ''' character.
    '''
    ''' Field layout on the wire:
    '''   1 byte   X'5A'      introducer (carriage control)
    '''   2 bytes  length     big-endian; counts every byte AFTER the X'5A'
    '''   3 bytes  SFID       structured field identifier
    '''   1 byte   flags      X'00'
    '''   2 bytes  reserved   X'0000'
    '''   n bytes  data
    '''
    ''' Therefore length = 8 + data.Length, and the maximum data size is
    ''' 32767 - 8 = 32759 bytes.
    ''' </summary>
    Public NotInheritable Class StructuredFieldWriter

        Public Const Introducer As Byte = &H5A
        Public Const MaxFieldLength As Integer = &H7FFF
        ''' <summary>Largest data payload that fits in a single structured field.</summary>
        Public Const MaxDataLength As Integer = MaxFieldLength - 8

        Private ReadOnly _output As Stream

        Public Sub New(output As Stream)
            If output Is Nothing Then Throw New ArgumentNullException(NameOf(output))
            _output = output
        End Sub

        ''' <summary>Write one structured field with the given identifier and data.</summary>
        Public Sub Write(sfid As Byte(), data As Byte())
            If sfid Is Nothing OrElse sfid.Length <> 3 Then
                Throw New ArgumentException("Structured field identifier must be exactly 3 bytes.", NameOf(sfid))
            End If
            Dim dataLen = If(data Is Nothing, 0, data.Length)
            If dataLen > MaxDataLength Then
                Throw New ArgumentException($"Structured field data exceeds {MaxDataLength} bytes.", NameOf(data))
            End If

            Dim length = 8 + dataLen ' length, sfid(3), flags, reserved(2), data

            _output.WriteByte(Introducer)
            _output.WriteByte(CByte((length >> 8) And &HFF))
            _output.WriteByte(CByte(length And &HFF))
            _output.Write(sfid, 0, 3)
            _output.WriteByte(&H0)                 ' flags
            _output.WriteByte(&H0)                 ' reserved (high)
            _output.WriteByte(&H0)                 ' reserved (low)
            If dataLen > 0 Then _output.Write(data, 0, dataLen)
        End Sub

        ''' <summary>Write a structured field that carries no data (Begin/End markers).</summary>
        Public Sub Write(sfid As Byte())
            Write(sfid, Nothing)
        End Sub

    End Class

End Namespace
