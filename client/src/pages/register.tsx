import { Formik, Form } from 'formik'
import React from 'react'
import InputField from '../components/InputField'
import Wrapper from '../components/Wrapper'
import { Box, Button } from "@chakra-ui/react"
import { useMutation } from 'urql'

interface registerProps {}

const Register: React.FC<registerProps> = ({}) => {
    const [] = useMutation(``)
    return (
        <Wrapper variant="small">
            <Formik initialValues={{ username: '', password: '' }} onSubmit={(values) => {
            console.log(values)
        }}>
            {({ isSubmitting }) => (
                <Form>
                    <InputField
                        name="username"
                        placeholder="username"
                        label="Username"
                    />
                    <Box mt={4}>
                        <InputField
                            name="password"
                            placeholder="password"
                            label="Password"
                            type="password"
                        />
                    </Box>
                    <Button
                        mt={4}
                        colorScheme='teal'
                        isLoading={isSubmitting}
                        type='submit'
                    >Register</Button>
                </Form>
            )}
        </Formik>
        </Wrapper>
    )
}

export default Register