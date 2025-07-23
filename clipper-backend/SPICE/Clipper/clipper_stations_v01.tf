KPL/FK
 
   FILE: clipper_stations_v01.tf
 
   This file was created by PINPOINT.
 
   PINPOINT Version 3.2.0 --- September 6, 2016
   PINPOINT RUN DATE/TIME:    2019-08-20T10:07:20
   PINPOINT DEFINITIONS FILE: clipper_stations_v01.pinpoint
   PINPOINT PCK FILE:         earth_wgs84.tpc
   PINPOINT SPK FILE:         clipper_stations_v01.bsp
 
   The input definitions file is appended to this
   file as a comment block.
 
 
   Body-name mapping follows:
 
\begindata
 
   NAIF_BODY_NAME                      += 'OVRO-LWA'
   NAIF_BODY_CODE                      += -159931
 
   NAIF_BODY_NAME                      += 'JICARMARCA'
   NAIF_BODY_CODE                      += -159932
 
\begintext
 
 
   Reference frame specifications follow:
 
 
   Topocentric frame OVRO-LWA_TOPO
 
      The Z axis of this frame points toward the zenith.
      The X axis of this frame points North.
 
      Topocentric frame OVRO-LWA_TOPO is centered at the
      site OVRO-LWA, which has Cartesian coordinates
 
         X (km):                 -0.2409253600000E+04
         Y (km):                 -0.4477900300000E+04
         Z (km):                  0.3839317100000E+04
 
      and planetodetic coordinates
 
         Longitude (deg):      -118.2816728383474
         Latitude  (deg):        37.2396322578526
         Altitude   (km):         0.1186928483984E+01
 
      These planetodetic coordinates are expressed relative to
      a reference spheroid having the dimensions
 
         Equatorial radius (km):  6.3781370000000E+03
         Polar radius      (km):  6.3567523140000E+03
 
      All of the above coordinates are relative to the frame ITRF93.
 
 
\begindata
 
   FRAME_OVRO-LWA_TOPO                 =  840069
   FRAME_840069_NAME                   =  'OVRO-LWA_TOPO'
   FRAME_840069_CLASS                  =  4
   FRAME_840069_CLASS_ID               =  840069
   FRAME_840069_CENTER                 =  -159931
 
   OBJECT_-159931_FRAME                =  'OVRO-LWA_TOPO'
 
   TKFRAME_840069_RELATIVE             =  'ITRF93'
   TKFRAME_840069_SPEC                 =  'ANGLES'
   TKFRAME_840069_UNITS                =  'DEGREES'
   TKFRAME_840069_AXES                 =  ( 3, 2, 3 )
   TKFRAME_840069_ANGLES               =  ( -241.7183271616526,
                                             -52.7603677421474,
                                             180.0000000000000 )
 
 
\begintext
 
   Topocentric frame JICARMARCA_TOPO
 
      The Z axis of this frame points toward the zenith.
      The X axis of this frame points North.
 
      Topocentric frame JICARMARCA_TOPO is centered at the
      site JICARMARCA, which has Cartesian coordinates
 
         X (km):                  0.1417303700000E+04
         Y (km):                 -0.6078230400000E+04 
         Z (km):                 -0.1312258000000E+04
 
      and planetodetic coordinates
 
         Longitude (deg):       -76.8744712157429
         Latitude  (deg):       -11.9514655016581
         Altitude   (km):         0.5196168604582E+00
 
      These planetodetic coordinates are expressed relative to
      a reference spheroid having the dimensions
 
         Equatorial radius (km):  6.3781370000000E+03
         Polar radius      (km):  6.3567523140000E+03
 
      All of the above coordinates are relative to the frame ITRF93.
 
 
\begindata
 
   FRAME_JICARMARCA_TOPO               =  840068
   FRAME_840068_NAME                   =  'JICARMARCA_TOPO'
   FRAME_840068_CLASS                  =  4
   FRAME_840068_CLASS_ID               =  840068
   FRAME_840068_CENTER                 =  -159932
 
   OBJECT_-159932_FRAME                =  'JICARMARCA_TOPO'
 
   TKFRAME_840068_RELATIVE             =  'ITRF93'
   TKFRAME_840068_SPEC                 =  'ANGLES'
   TKFRAME_840068_UNITS                =  'DEGREES'
   TKFRAME_840068_AXES                 =  ( 3, 2, 3 )
   TKFRAME_840068_ANGLES               =  ( -283.1255287842571,
                                            -101.9514655016581,
                                             180.0000000000000 )
 
\begintext
 
 
Definitions file clipper_stations_v01.pinpoint
--------------------------------------------------------------------------------
 
 
 
   SPK/FK for Ground Stations/Observatories of Interest to Europa Clipper
   =====================================================================
 
   Original SPK file name:               clipper_stations_v01.bsp
   Original FK file name:                clipper_stations_v01.tf
   Creation date:                        20-AUG-2019
   Created by:                           Boris Semenov  (NAIF/JPL)
 
 
   This SPK/FK contains locations/topocentric frame definitions for
   additional ground stations and observatories of interest to the
   Europa Clipper mission.
 
   It is intended to be used only for the Europa Clipper mission
   planning/design applications.
 
   Locations of the OVRO-LWA and Jicarmarca radio observatories from
   Europa Clipper JIRA Issue AP-754, retrieved on 08/20/19, are:
 
      OVRO-LWA:
 
         X: -2409.2536
         Y: -4477.9003
         Z:  3839.3171
 
      Jicarmarca:
 
         X:  1417.3037
         Y: -6078.2304
         Z: -1312.2580
 
   These coordinates were specified in AP-754 w.r.t. ITRF2008. In these
   SPK/FK they are used w.r.t. ITRF93, which was the only
   high-precision Earth orientation frame available in SPICE at the
   time when these SPK/FK were created. This introduces an error of a
   few centimeters/milliarseconds, most likely insignificant in
   applications for which this SPK/FK are intended.
 
   No velocity data were provided with the position information.
 
   The IDs for these stations/observatories and their frames are picked
   from the Europa Clipper NAIF ID range (-15993x).
 
      begindata
 
 
      SITES              +=      'OVRO-LWA'
      OVRO-LWA_FRAME      =       'ITRF93'
      OVRO-LWA_CENTER     =       399
      OVRO-LWA_IDCODE     =      -159931
      OVRO-LWA_BOUNDS     =    (  @1950-JAN-01/00:00,  @2050-JAN-01/00:00  )
      OVRO-LWA_XYZ        =    (
                                  -2409.2536
                                  -4477.9003
                                   3839.3171
                               )
 
      OVRO-LWA_UP         =     'Z'
      OVRO-LWA_NORTH      =     'X'
 
 
      SITES              +=      'JICARMARCA'
      JICARMARCA_FRAME    =       'ITRF93'
      JICARMARCA_CENTER   =       399
      JICARMARCA_IDCODE   =      -159932
      JICARMARCA_BOUNDS   =    (  @1950-JAN-01/00:00,  @2050-JAN-01/00:00  )
      JICARMARCA_XYZ      =    (
                                   1417.3037
                                  -6078.2304
                                  -1312.2580
                               )
 
      JICARMARCA_UP       =     'Z'
      JICARMARCA_NORTH    =     'X'
 
      begintext
 
 
   Earth RADII for FK generation
   =====================================================================
 
   Author:                                        Boris Semenov  (NAIF/JPL)
   File creation date:                            20-AUG-2019
 
 
   Reference Spheroid
   ------------------
 
   The WGS84 reference spheroid radii used to generate rotations for
   the topocentric frames are provided below for the record.
 
      begindata
 
         BODY399_RADII = ( 6378.137, 6378.137, 6356.752314 )
 
      begintext
 
 
 
begintext
 
[End of definitions file]
 
