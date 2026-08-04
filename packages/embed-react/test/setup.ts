// React refuses to run `act` outside a declared test environment, and warns loudly rather than
// failing — which would make every lifecycle assertion in this suite quietly meaningless.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
