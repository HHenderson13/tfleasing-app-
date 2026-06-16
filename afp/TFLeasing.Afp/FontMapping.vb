Imports System.Collections.Generic

Namespace Global.TFLeasing.Afp

    ''' <summary>
    ''' Maps a one-byte local font identifier (referenced by the SCFL control
    ''' sequence in the text stream) to an AFP coded font, expressed as a code
    ''' page resource plus a font character set resource.
    '''
    ''' Example pairing for a 10-point Times resource set:
    '''   LocalId = 1, CodePageName = "T1V10037", FontCharacterSetName = "C0H200B0"
    ''' </summary>
    Public NotInheritable Class FontMapping

        Public Sub New(localId As Byte, codePageName As String, fontCharacterSetName As String)
            If String.IsNullOrWhiteSpace(codePageName) Then
                Throw New ArgumentException("Code page name is required.", NameOf(codePageName))
            End If
            If String.IsNullOrWhiteSpace(fontCharacterSetName) Then
                Throw New ArgumentException("Font character set name is required.", NameOf(fontCharacterSetName))
            End If
            Me.LocalId = localId
            Me.CodePageName = codePageName
            Me.FontCharacterSetName = fontCharacterSetName
        End Sub

        ''' <summary>The local id referenced by <see cref="PresentationTextBuilder.SetFont"/>.</summary>
        Public ReadOnly Property LocalId As Byte
        ''' <summary>The AFP code page resource name (up to 8 characters).</summary>
        Public ReadOnly Property CodePageName As String
        ''' <summary>The AFP font character set resource name (up to 8 characters).</summary>
        Public ReadOnly Property FontCharacterSetName As String

    End Class

    ''' <summary>
    ''' Builds the data payload for a Map Coded Font (MCF, format 2) structured
    ''' field from a set of <see cref="FontMapping"/>s.
    '''
    ''' MCF-2 carries one repeating group per font. Each repeating group is a
    ''' 1-byte length followed by triplets:
    '''   * Resource Local Identifier (X'24') — binds the local id used by SCFL.
    '''   * Fully Qualified Name (X'02'), FQN type X'0E' — the code page name.
    '''   * Fully Qualified Name (X'02'), FQN type X'0F' — the font character set name.
    ''' </summary>
    Public Module MapCodedFontBuilder

        Private Const TripletFullyQualifiedName As Byte = &H2
        Private Const TripletResourceLocalId As Byte = &H24
        Private Const FqnTypeCodePageName As Byte = &HE
        Private Const FqnTypeFontCharacterSetName As Byte = &HF
        Private Const FqnFormatCharacterString As Byte = &H0
        Private Const ResourceTypeCodedFont As Byte = &H5
        Private Const ResourceNameLength As Integer = 8

        Public Function Build(fonts As IEnumerable(Of FontMapping)) As Byte()
            Dim data As New List(Of Byte)()
            For Each font In fonts
                Dim rg As New List(Of Byte)()

                ' Resource Local Identifier triplet: length, id, resource type, local id.
                rg.Add(4)
                rg.Add(TripletResourceLocalId)
                rg.Add(ResourceTypeCodedFont)
                rg.Add(font.LocalId)

                ' Code page name (Fully Qualified Name triplet).
                rg.AddRange(FqnTriplet(FqnTypeCodePageName, font.CodePageName))
                ' Font character set name (Fully Qualified Name triplet).
                rg.AddRange(FqnTriplet(FqnTypeFontCharacterSetName, font.FontCharacterSetName))

                ' Prepend the repeating-group length (includes the length byte itself).
                data.Add(CByte(rg.Count + 1))
                data.AddRange(rg)
            Next
            Return data.ToArray()
        End Function

        Private Function FqnTriplet(fqnType As Byte, name As String) As Byte()
            Dim nameBytes = Ebcdic.ToEbcdicFixed(name, ResourceNameLength)
            Dim triplet(4 + nameBytes.Length - 1) As Byte
            triplet(0) = CByte(triplet.Length)          ' triplet length (incl. this byte)
            triplet(1) = TripletFullyQualifiedName
            triplet(2) = fqnType
            triplet(3) = FqnFormatCharacterString
            Array.Copy(nameBytes, 0, triplet, 4, nameBytes.Length)
            Return triplet
        End Function

    End Module

End Namespace
