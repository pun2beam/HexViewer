meta:
  id: kfx
  title: Kindle KFX container (best-effort)
  file-extension:
    - kfx
  ks-version: 0.9
  endian: le

seq:
  - id: file_hdr
    type: file_header

instances:
  container_stream:
    pos: file_hdr.ofs_container_info
    type: container_info


types:
  file_header:
    seq:
      - id: file_type
        contents: "CONT"
      - id: version
        type: u2
        doc: Container format version (observed 1 or 2 per various notes)
      - id: len_header
        type: u4
      - id: ofs_container_info
        type: u4
      - id: len_container_info
        type: u4
      - id: rest
        size: "(len_header> _io.pos ? len_header- _io.pos : 0)"


  container_info:
    seq:
      - id: id_container
        -orig-id: d409
        type: ion_value
      - id: id_compress
        -orig-id: d410
        type: ion_value
      - id: id_drm_s
        -orig-id: d411
        type: ion_value
      - id: len_chank
        -orig-id: d412
        type: ion_value
      - id: ofs_entity_index_table
        -orig-id: d413
        type: ion_value
      - id: len_entity_index_table
        -orig-id: d414
        type: ion_value
      - id: ofs_symbol_table
        -orig-id: d415
        type: ion_value
      - id: len_symbol_table
        -orig-id: d416
        type: ion_value
      - id: ofs_fuction_block
        -orig-id: d594
        type: ion_value
      - id: len_fuction_block
        -orig-id: d595
        type: ion_value

  # ---- Generic Amazon Ion binary ----
  ion_stream:
    doc: Concatenation of Ion values until EOF.
    seq:
      - id: values
        type: ion_value
        repeat: eos

  ion_value:
    seq:
      - id: td
        type: type_descr
      - id: length
        type: var_uint
        if: td.len_nibble == 0xE and not td.is_nop
      - id: repr
        size: repr_size
        type:
          switch-on: td.type_code
          cases:
            0xB: ion_container_stream   # list
            0x9: ion_container_stream   # sexp
            0xD: ion_struct_stream      # struct
        if: repr_size > 0

    instances:
      repr_size:
        value: "(td.len_nibble < 0xE ? td.len_nibble : (td.len_nibble == 0xE ? (td.is_nop ? 0 : length.value) : 0))"

  ion_container_stream:
    seq:
      - id: items
        type: ion_value
        repeat: eos

  ion_struct_stream:
    seq:
      - id: fields
        type: ion_struct_field
        repeat: eos

  ion_struct_field:
    seq:
      - id: field_sid
        type: var_uint
      - id: value
        type: ion_value

  type_descr:
    seq:
      - id: b
        type: u1
    instances:
      type_code:
        value: (b >> 4)
      len_nibble:
        value: (b & 0x0F)
      is_nop:
        value: type_code == 0 and len_nibble == 0

  var_uint:
    doc: >
      Amazon Ion varUInt values are encoded as base-128 big-endian groups
      (see the "VarUInt and VarInt Fields" section of the Amazon Ion binary
      format specification). We therefore accumulate the decoded value by
      treating the earliest byte in the stream as the most significant group.
    seq:
      - id: bytes
        type: u1
        repeat: until
        repeat-until: (bytes[-1] & 0x80) == 0
    instances:
      value:
        value: "(bytes.size == 0 ? 0 :
          (bytes[bytes.size - 1] & 0x7F) +
          (bytes.size > 1 ? (((bytes[bytes.size - 2] & 0x7F) << 7)) : 0) +
          (bytes.size > 2 ? (((bytes[bytes.size - 3] & 0x7F) << 14)) : 0) +
          (bytes.size > 3 ? (((bytes[bytes.size - 4] & 0x7F) << 21)) : 0) +
          (bytes.size > 4 ? (((bytes[bytes.size - 5] & 0x7F) << 28)) : 0) +
          (bytes.size > 5 ? (((bytes[bytes.size - 6] & 0x7F) << 35)) : 0) +
          (bytes.size > 6 ? (((bytes[bytes.size - 7] & 0x7F) << 42)) : 0) +
          (bytes.size > 7 ? (((bytes[bytes.size - 8] & 0x7F) << 49)) : 0) +
          (bytes.size > 8 ? (((bytes[bytes.size - 9] & 0x7F) << 56)) : 0) +
          (bytes.size > 9 ? (((bytes[bytes.size - 10] & 0x7F) << 63)) : 0)
        )"
