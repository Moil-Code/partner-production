# New Dashboard Features - CSV Import/Export

## Overview
Added bulk license management capabilities with CSV import and export functionality to streamline admin workflows.

## New API Endpoints

### 1. **POST `/api/licenses/import`**
Bulk import licenses from CSV file.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: CSV file with `email` column

**CSV Format:**
```csv
email
john.doe@example.com
jane.smith@company.com
michael.brown@business.com
```

**Response:**
```json
{
  "message": "Import complete: 3 successful, 0 failed",
  "results": {
    "success": 3,
    "failed": 0,
    "errors": []
  }
}
```

**Features:**
- Validates email format
- Checks for duplicate licenses
- Generates activation tokens automatically
- Returns detailed results with error messages
- Requires admin authentication

### 2. **GET `/api/licenses/export`**
Export all licenses to CSV file.

**Request:**
- Method: `GET`
- Authentication: Required (admin)

**Response:**
- Content-Type: `text/csv`
- Downloads file: `moil-partners-licenses-YYYY-MM-DD.csv`

**CSV Columns:**
- Email
- Status (Active/Pending)
- Date Added
- Activated At

## Dashboard Updates

### CSV Import Section
Located below the "Add New License" form:

**Features:**
- File input with visual feedback
- Shows selected filename
- Import button (disabled until file selected)
- Loading state during import
- Success/error messages

**Usage:**
1. Click "Choose CSV File"
2. Select CSV file with email addresses
3. Click "Import CSV"
4. View import results

### CSV Export Button
Located in the table controls (next to search):

**Features:**
- One-click export
- Automatic filename with date
- Downloads all licenses for the admin
- Includes status and dates

**Usage:**
1. Click "Export CSV" button
2. File downloads automatically
3. Open in Excel or Google Sheets

## Sample CSV Template

A sample CSV template is available at `/public/sample-licenses.csv`:

```csv
email
john.doe@example.com
jane.smith@company.com
michael.brown@business.com
```

## Security

### Authentication
- Both endpoints require admin authentication
- Uses Supabase `getUser()` to verify session
- Checks admin role in database

### Validation
- Email format validation
- Duplicate license detection
- Admin ownership verification
- File type validation (.csv only)

### Error Handling
- Detailed error messages for failed imports
- Graceful handling of malformed CSV
- Transaction-like behavior (each license independent)

## User Experience

### Import Flow
1. **Select File**: Visual feedback shows filename
2. **Import**: Button shows loading state
3. **Results**: Success message with count
4. **Errors**: Detailed list of failed emails
5. **Refresh**: License list updates automatically

### Export Flow
1. **Click Export**: Instant download starts
2. **Filename**: Auto-generated with date
3. **Format**: Standard CSV for Excel/Sheets
4. **Success**: Confirmation message

## Technical Implementation

### Client-Side
- `FormData` API for file upload
- `Blob` API for file download
- React state management for UI feedback
- File input with hidden styling

### Server-Side
- CSV parsing with `split()` and `map()`
- Batch processing with error collection
- Supabase database operations
- Response streaming for downloads

## Error Handling

### Import Errors
- **Invalid email**: Skipped with error message
- **Duplicate license**: Skipped with error message
- **Database error**: Logged and reported
- **No file**: User-friendly error message

### Export Errors
- **Authentication failure**: 401 Unauthorized
- **Database error**: 500 Internal Server Error
- **No licenses**: Empty CSV with headers

## Future Enhancements

### Potential Additions
1. **Bulk Activation**: Activate multiple licenses at once
2. **CSV Validation**: Preview before import
3. **Progress Bar**: Show import progress
4. **Email Templates**: Custom activation messages
5. **Scheduling**: Automated license provisioning
6. **Analytics**: Usage reports and insights

### CSV Format Extensions
```csv
email,business_name,business_type
john@example.com,Acme Corp,Technology
jane@company.com,Smith LLC,Retail
```

## Testing

### Test CSV Import
1. Create CSV with valid emails
2. Create CSV with invalid emails
3. Create CSV with duplicate emails
4. Test empty CSV
5. Test malformed CSV

### Test CSV Export
1. Export with no licenses
2. Export with few licenses
3. Export with many licenses
4. Verify CSV format
5. Test in Excel/Sheets

## Documentation

### For Admins
- CSV format requirements
- Sample template download
- Error message meanings
- Best practices for bulk import

### For Developers
- API endpoint documentation
- Error codes and messages
- Database schema requirements
- Security considerations

## Deployment Checklist

- [x] Create import API endpoint
- [x] Create export API endpoint
- [x] Add CSV upload UI
- [x] Add export button
- [x] Test file upload
- [x] Test file download
- [x] Add error handling
- [x] Add loading states
- [x] Create sample template
- [ ] Update README
- [ ] Add user documentation
- [ ] Test in production

## Summary

The CSV import/export feature significantly improves the admin experience by:
- **Saving Time**: Bulk operations vs. one-by-one
- **Reducing Errors**: Automated validation
- **Improving Workflow**: Easy data management
- **Enabling Scale**: Handle hundreds of licenses
- **Providing Flexibility**: Export for reporting

**Ready to use!** 🚀
