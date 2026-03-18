# L-Shaped Attachment Buildings - Project Status

**Status:** PARKED - Awaiting specification clarification  
**Date:** 2026-03-06  
**Last worked:** 2026-03-05

## What Was Requested

An "L-shaped building" configuration mode for attachments that:
- Creates a building where one attachment wraps around a corner
- Allows attachment on **front or back walls** (the long sides when depth > width)
- Only available when main building is rectangular with depth > width
- Only for apex or pent roof styles

## Work Completed

### 1. Backend Logic (params.js)
- ✅ Added `isLShapedAllowed()` validation function
- ✅ Added L-shaped configuration to attachment defaults:
  ```javascript
  lShaped: {
    enabled: false,
    corner: "near",  // "near" or "far"
    type: "apex"     // matches main building roof type
  }
  ```
- ❌ **Logic inverted** - checks for left/right walls instead of front/back

### 2. UI Implementation (index.js)
- ✅ Added "Attachment Type" dropdown with options:
  - "Standard Attachment"
  - "L-Shaped Building"
- ✅ Created `updateAttachmentWallDropdown()` to filter wall options based on type
- ✅ Auto-configures L-shaped properties when creating attachment
- ✅ Dynamic wall dropdown that hides unavailable walls
- ❌ **Wall filtering inverted** - hides front/back, shows left/right (should be opposite)

### 3. UI Enhancements
- ✅ L-shaped section in attachment editor shows:
  - Corner position selector (near/far)
  - Roof type display (matches main building)
  - Explanatory hint text
- ✅ Disabled state when not allowed with explanation
- ❌ **Help text wrong** - says "left/right" instead of "front/back"

### 4. Cache Busting
- ✅ Updated both HTML files: `?_v=42` → `?_v=43`

## Problems Identified

### Critical Issue: Wall Direction Confusion
The specification from code shows:
```javascript
// Attachment must be on a long side (front or back)
const wall = attachment?.attachTo?.wall || 'left';
if (wall !== 'front' && wall !== 'back') return false;
```

But our understanding of the building coordinate system may be off:
- **Front/Back** = walls perpendicular to depth (Z axis) - run along width (X)
- **Left/Right** = walls perpendicular to width (X axis) - run along depth (Z)

When depth > width:
- Left/right walls are LONGER (they span the depth dimension)
- Front/back walls are SHORTER (they span the width dimension)

**The code wants attachments on "front or back" but these would be the SHORT walls when depth > width.**

This suggests either:
1. The coordinate system understanding is wrong, OR
2. The specification in the code is wrong, OR
3. "Long side" doesn't mean "physically longer wall"

## Files Modified (Uncommitted)

1. `docs/src/params.js`
   - Line 298-308: `isLShapedAllowed()` function
   - Wall check: `wall !== 'front' && wall !== 'back'`

2. `docs/src/index.js`
   - Line 654: Added `attachmentTypeEl` reference
   - Line 6744: Updated help text (WRONG - says left/right)
   - Line 7001-7073: Add attachment button handler with L-shaped logic (WRONG - uses left/right)
   - Line 7089-7143: `updateAttachmentWallDropdown()` (WRONG - hides front/back instead of left/right)
   - Line 7054-7072: L-shaped auto-configuration on attachment creation

3. `docs/configurator.html`
   - Cache bust: `?_v=42` → `?_v=43`

4. `docs/index.html`
   - Cache bust: `?_v=42` → `?_v=43`

## Pros of Current Approach

1. **Clean UI/UX**
   - Single dropdown to select attachment type
   - Wall options automatically filter based on type
   - Clear "coming soon" or "not allowed" messaging
   
2. **Proper validation**
   - `isLShapedAllowed()` checks all constraints
   - UI respects these constraints

3. **Extensible**
   - Easy to add more attachment types in future
   - L-shaped properties cleanly namespaced in state

4. **Non-breaking**
   - Standard attachments work exactly as before
   - L-shaped is opt-in via dropdown

## Cons of Current Approach

1. **Fundamental misunderstanding**
   - Wall direction logic is inverted
   - Need to clarify coordinate system vs "long side" terminology
   
2. **Incomplete geometry**
   - No rendering code for L-shaped buildings yet
   - Would need attachments.js modifications to handle corner joins

3. **No corner join logic**
   - L-shaped requires TWO attachments that meet at a corner
   - Current code treats it as single attachment with flag
   - May need different data structure

4. **BOM/Pricing implications unclear**
   - How to price a corner join?
   - Shared wall material deduction?

## What's Needed to Complete

1. **Clarify specification**
   - Which walls should L-shaped attach to? (physical long sides vs coordinate system "front/back")
   - Show example sketches/screenshots of desired result
   
2. **Fix wall filtering logic**
   - Correct `isLShapedAllowed()` check
   - Correct `updateAttachmentWallDropdown()` hiding
   - Correct help text

3. **Geometry rendering**
   - Modify `attachments.js` to handle L-shaped corner joins
   - Calculate correct positions for two meeting attachments
   - Handle shared corner post

4. **BOM/Pricing**
   - Update pricing.js for L-shaped
   - Update BOM to show corner material sharing

## Recommended Next Steps

1. **Before coding:** Draw/sketch the exact scenario
   - Show main building dimensions (e.g., 2400w × 3600d)
   - Show which wall(s) the L-shaped attachment goes on
   - Show corner position (near/far)
   
2. **Verify coordinate system**
   - Confirm X = width, Z = depth
   - Confirm "front" = -Z, "back" = +Z, "left" = -X, "right" = +X
   - Confirm which dimension is "long side"

3. **Then resume with correct understanding**

## Repository State
- Branch: main
- Uncommitted changes: 4 files modified
- Dev server: Running on :5173
- Last build: 7abbfb9
