<!-- model: sonnet -->
<!-- mode: fire-and-review -->

# Plan: Add User Authentication

## Objective
Add JWT-based authentication with login/signup screens.

## Constraints
- Do NOT modify files outside the Scope section
- Use existing Button component from @/components/ui

## Scope
### New files
- src/screens/LoginScreen.tsx
- src/services/AuthService.ts

### Modified files
- src/navigation/types.ts

## Implementation Steps
### Step 1: Create AuthService
Set up the JWT token management service.

### Step 2: Build LoginScreen
Create the login UI with form validation.

### Step 3: Wire up navigation
Add auth routes to the navigation stack.

## Test Scenarios
- TS-01: Login with valid credentials succeeds
- TS-02: Login with invalid credentials shows error
