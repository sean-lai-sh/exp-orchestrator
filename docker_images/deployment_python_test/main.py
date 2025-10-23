import os

ENV_VAR_1 = os.getenv("ENV_VAR_1", "FAILURE") ## Intended Value ==> "SUCCESS"
ENV_VAR_2 = os.getenv("ENV_VAR_2", "FAILURE") ## Intended Value ==> "SUCCESS"
ENV_VAR_3 = os.getenv("ENV_VAR_3", "FAILURE") ## Intended Value ==> "SUCCESS"
ENV_VAR_4 = os.getenv("ENV_VAR_4", "FAILURE") ## Intended Value ==> "SUCCESS"


def main():
    ### test that all environment variables are set
    if ENV_VAR_1 == "FAILURE" or ENV_VAR_2 == "FAILURE" or ENV_VAR_3 == "FAILURE" or ENV_VAR_4 == "FAILURE":
        print("One or more environment variables are not set correctly.")
        return
    else:
        print("All environment variables are set correctly.")
    

main()