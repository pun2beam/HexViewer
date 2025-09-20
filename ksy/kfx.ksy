meta:
  id: kfx
  title: Kindle KFX container (best-effort)
  file-extension:
    - kfx
  ks-version: 0.9
  endian: le

doc: |
  Best-effort KFX loader:
    - If file starts with 'PK\x03\x04', parse as ZIP (KFX-ZIP).
    - If file starts with 'CONT', parse a minimal container stub (unknown exact layout).
    - Otherwise, parse as Amazon Ion binary stream (common KFX payload).

seq:
  - id: sig4
    type: u4
  - id: body
    type:
      switch-on: sig4
      cases:
        0x544E4F43: cont_container  # 'CONT'
        _: ion_stream
    size-eos: true

types:
  # ---- Minimal 'CONT' container stub (structure unknown in detail) ----
  cont_container:
    seq:
      - id: version
        type: u2
        doc: Container format version (observed 1 or 2 per various notes)
      - id: header_length
        type: u4
      - id: container_info_offset
        type: u4
      - id: container_info_length
        type: u4
      - id: rest
        size: header_length - _root._io.pos - 14
  # ---- Generic Amazon Ion binary ----
  ion_stream:
    doc: Concatenation of Ion values until EOF.
    seq:
      - id: values
        type: ion_value
        repeat: until
        repeat-until: _io.is_eof

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
        value: "(td.len_nibble < 0xE ? td.len_nibble : (td.len_nibble == 0xE ? ((length != null) ? length.value : 0) : 0))"

  ion_container_stream:
    seq:
      - id: items
        type: ion_value
        repeat: until
        repeat-until: _io.is_eof

  ion_struct_stream:
    seq:
      - id: fields
        type: ion_struct_field
        repeat: until
        repeat-until: _io.is_eof

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
    seq:
      - id: bytes
        type: u1
        repeat: until
        repeat-until: (bytes[-1] & 0x80) == 0
    instances:
      value:
        value: "(bytes.size == 0 ? 0 :
          (bytes[0] & 0x7F) +
          (bytes.size > 1 ? (((bytes[1] & 0x7F) << 7)) : 0) +
          (bytes.size > 2 ? (((bytes[2] & 0x7F) << 14)) : 0) +
          (bytes.size > 3 ? (((bytes[3] & 0x7F) << 21)) : 0) +
          (bytes.size > 4 ? (((bytes[4] & 0x7F) << 28)) : 0) +
          (bytes.size > 5 ? (((bytes[5] & 0x7F) << 35)) : 0) +
          (bytes.size > 6 ? (((bytes[6] & 0x7F) << 42)) : 0) +
          (bytes.size > 7 ? (((bytes[7] & 0x7F) << 49)) : 0) +
          (bytes.size > 8 ? (((bytes[8] & 0x7F) << 56)) : 0) +
          (bytes.size > 9 ? (((bytes[9] & 0x7F) << 63)) : 0)
        )"

