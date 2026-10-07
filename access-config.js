// access-config.js - SINGLE SOURCE OF TRUTH for who can view/manage the Users area.
// Edit this ONE file to change access rules. The server reads it via require();
// the frontend reads the same values via GET /api/access-config. Nothing else
// hard-codes these role lists.
module.exports = {
  // Roles that may open the Users page and manage (add/edit/remove/reset) user accounts.
  userManagerRoles: ['admin', 'system'],
  // Roles that may see the `system` account in the Users list.
  systemVisibleRoles: ['system']
};
