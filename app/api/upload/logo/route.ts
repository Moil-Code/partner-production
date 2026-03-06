import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      return NextResponse.json({ 
        error: 'Image upload service not configured. Please contact support.' 
      }, { status: 500 });
    }

    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get admin info to check permissions
    const { data: admin } = await supabase
      .from('admins')
      .select('partner_id, global_role')
      .eq('id', user.id)
      .single();

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const isMoilAdmin = admin.global_role === 'moil_admin';
    
    // Only Moil admins or partner admins can upload logos
    if (!isMoilAdmin && admin.global_role !== 'partner_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const partnerId = formData.get('partnerId') as string;
    const partnerName = formData.get('partnerName') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Allowed: PNG, JPEG, SVG, WebP' 
      }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 5MB' 
      }, { status: 400 });
    }

    // For Moil admins creating new partners, allow upload without partnerId
    // The logo URL will be passed to the partner creation API
    const isNewPartnerUpload = isMoilAdmin && !partnerId && partnerName;
    
    // Determine which partner to update
    let targetPartnerId = partnerId;
    if (!isMoilAdmin) {
      // Non-Moil admins can only update their own partner
      if (partnerId && partnerId !== admin.partner_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      targetPartnerId = admin.partner_id;
    }

    if (!targetPartnerId && !isNewPartnerUpload) {
      return NextResponse.json({ error: 'Partner ID required' }, { status: 400 });
    }

    // Convert file to base64 for Cloudinary upload
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    // Generate a unique public_id for the upload
    // For new partners, use a sanitized version of the partner name with timestamp
    // For existing partners, use the partner ID
    const sanitizedName = partnerName ? partnerName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30) : '';
    const publicId = isNewPartnerUpload 
      ? `new-${sanitizedName}-${Date.now()}`
      : `partner-${targetPartnerId}`;

    // Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'moil-partners/logos',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'limit' },
          { quality: 'auto:best' },
          { fetch_format: 'auto' }
        ]
      });
    } catch (cloudinaryError: any) {
      console.error('Cloudinary upload error:', cloudinaryError);
      return NextResponse.json({ 
        error: `Failed to upload image: ${cloudinaryError.message || 'Unknown error'}` 
      }, { status: 500 });
    }

    // Only update partner record if we have a partnerId (not for new partner creation)
    // For new partners, the logo URL will be passed to the create-with-team API
    if (targetPartnerId) {
      const { error: updateError } = await supabase
        .from('partners')
        .update({ logo_url: uploadResult.secure_url })
        .eq('id', targetPartnerId);

      if (updateError) {
        console.error('Error updating partner logo:', updateError);
        return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true,
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('partner_id, global_role')
      .eq('id', user.id)
      .single();

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const isMoilAdmin = admin.global_role === 'moil_admin';
    
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partnerId');

    let targetPartnerId = partnerId;
    if (!isMoilAdmin) {
      if (partnerId && partnerId !== admin.partner_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      targetPartnerId = admin.partner_id;
    }

    if (!targetPartnerId) {
      return NextResponse.json({ error: 'Partner ID required' }, { status: 400 });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(`moil-partners/logos/partner-${targetPartnerId}`);
    } catch (cloudinaryError) {
      console.error('Cloudinary delete error:', cloudinaryError);
    }

    // Clear logo URL in database
    const { error: updateError } = await supabase
      .from('partners')
      .update({ logo_url: '' })
      .eq('id', targetPartnerId);

    if (updateError) {
      console.error('Error clearing partner logo:', updateError);
      return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logo delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
